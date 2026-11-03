-- Monthly attendance report: stop "canceling statement due to statement timeout".
--
-- public.v_attendance_report_detailed found each day's first punch-in and
-- last punch-out by sorting every punch ever recorded (DISTINCT ON over all
-- of attendance.logs), and the planner re-ran that sort once per
-- employee-day. A month's report (~1,700 employee-days, fetched a page at a
-- time) hit the statement timeout. Same columns and same results; each
-- lookup is now one index probe on logs_employee_day_idx within that work
-- day (4am to 4am in the outlet's timezone).

create or replace view public.v_attendance_report_detailed with (security_invoker = true) as
 SELECT r.employee_id,
    r.employee_code,
    r.employee_name,
    r.designation_name,
    r.outlet_id,
    r.outlet_name,
    r.outlet_timezone,
    r.work_date,
    r.first_in_at,
    r.last_out_at,
    r.scheduled_start_at,
    r.scheduled_end_at,
    r.late_minutes,
    r.worked_minutes,
    r.status,
        CASE
            WHEN r.last_out_at IS NULL OR r.scheduled_end_at IS NULL THEN NULL::integer
            WHEN r.last_out_at >= r.scheduled_end_at THEN 0
            ELSE GREATEST(0, (EXTRACT(epoch FROM r.scheduled_end_at - r.last_out_at) / 60::numeric)::integer)
        END AS early_departure_minutes,
        CASE
            WHEN r.worked_minutes IS NULL THEN NULL::integer
            ELSE GREATEST(0, r.worked_minutes - 600)
        END AS overtime_minutes,
    fi.outlet_id AS first_in_outlet_id,
    fi_o.display_name AS first_in_outlet_name,
    fi.lat AS first_in_lat,
    fi.lng AS first_in_lng,
    lo.outlet_id AS last_out_outlet_id,
    lo_o.display_name AS last_out_outlet_name,
    lo.lat AS last_out_lat,
    lo.lng AS last_out_lng
   FROM v_attendance_report r
     LEFT JOIN LATERAL (
         SELECT l.outlet_id, l.lat, l.lng
           FROM attendance.logs l
          WHERE l.employee_id = r.employee_id AND l.type = 'in'::text
            AND l.punched_at >= ((r.work_date + '04:00:00'::interval) AT TIME ZONE COALESCE(r.outlet_timezone, 'Asia/Kolkata'::text))
            AND l.punched_at < ((r.work_date + '1 day 04:00:00'::interval) AT TIME ZONE COALESCE(r.outlet_timezone, 'Asia/Kolkata'::text))
          ORDER BY l.punched_at
         LIMIT 1) fi ON true
     LEFT JOIN LATERAL (
         SELECT l.outlet_id, l.lat, l.lng
           FROM attendance.logs l
          WHERE l.employee_id = r.employee_id AND l.type = 'out'::text
            AND l.punched_at >= ((r.work_date + '04:00:00'::interval) AT TIME ZONE COALESCE(r.outlet_timezone, 'Asia/Kolkata'::text))
            AND l.punched_at < ((r.work_date + '1 day 04:00:00'::interval) AT TIME ZONE COALESCE(r.outlet_timezone, 'Asia/Kolkata'::text))
          ORDER BY l.punched_at DESC
         LIMIT 1) lo ON true
     LEFT JOIN flax_outlets fi_o ON fi_o.id = fi.outlet_id
     LEFT JOIN flax_outlets lo_o ON lo_o.id = lo.outlet_id
;
