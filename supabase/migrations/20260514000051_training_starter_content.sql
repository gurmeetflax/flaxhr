-- Training starter content. Everything here is editable in Admin > Training.
--
--  1. Welcome to Flax       company introduction slides + quiz (all staff)
--  2. Your first week       how attendance, pay and the app work (all staff)
--  3. Lettuce cleaning      SOP from command.flaxfoods.in (kitchen)
--  4. Base prep             couscous, brown rice, quinoa, sweetcorn SOPs (kitchen)
--  5. Deep clean            SOP from command.flaxfoods.in (kitchen + outlet teams)
--
-- The SOP steps, targets and limits are copied from command's SOP tables
-- (flax_sop / flax_sop_step) as they stood on 17 Nov 2026.
--
-- Paths are created switched OFF: nothing is assigned to anyone until an
-- admin reviews the content and turns a path on in Admin > Training > Paths.

select training.save_module_doc($j${
  "code": "welcome-to-flax",
  "title": "Welcome to Flax",
  "summary": "Who we are, what we make, and how we look and sound. Start here.",
  "kind": "brand",
  "est_minutes": 8,
  "pass_mark": 80,
  "sort_order": 1,
  "lessons": [
    {"kind": "slide", "data": {"eyebrow": "WELCOME", "headline": "FLAX IT UP",
      "body": "Welcome to Flax Healthy Living. You've joined the team that makes fresh, bright food every single day. This short deck tells you who we are and how we work."}},
    {"kind": "slide", "data": {"eyebrow": "ESTD 2016", "headline": "WHO WE ARE",
      "body": "Flax started in 2016 with one simple idea: food that is good for you should also taste great and come fast.\n\nToday we cook across Mumbai (Andheri West, Bandra, Breach Candy, Kala Ghoda, Kalina, Lower Parel, Malad, Marol, Powai), Bangalore (Indiranagar) and Goa."}},
    {"kind": "slide", "data": {"eyebrow": "THE FOOD", "headline": "EAT BRIGHT",
      "body": "Bowls, salads, smoothies, parfaits and more, built on bases we cook fresh every morning.\n\nEvery dish has a recipe card in Command with exact grams for each ingredient. The guest should get the same dish every time, at every outlet."}},
    {"kind": "slide", "data": {"eyebrow": "FRESH, ALWAYS", "headline": "MADE THIS MORNING",
      "body": "Bases like quinoa, brown rice and couscous are cooked fresh each day.\n\nCleaned lettuce is used within 24 hours.\n\nCold food is kept at 1 to 5 °C. If it is not fresh, it does not go out."}},
    {"kind": "slide", "data": {"eyebrow": "THE GUEST", "headline": "COME HUNGRY",
      "body": "Greet every guest. Get the order right. Send every dish out looking like the photo on its recipe card.\n\nIf something goes wrong, tell your manager straight away. A complaint fixed fast is a guest who comes back."}},
    {"kind": "slide", "data": {"eyebrow": "HOW WE SOUND", "headline": "SHORT AND WARM",
      "body": "We talk like a friend, not a poster. We say \"you\". We keep it short.\n\nWe say fresh, bright, made this morning. We never say detox, guilt-free or superfood."}},
    {"kind": "slide", "data": {"eyebrow": "HOW WE LOOK", "headline": "THE FLAX BADGE",
      "body": "Our logo is the round FLAX Healthy Living badge, in black or white only.\n\nOur colours are bright but calm: navy, yellow, teal, pink, orange and sky. Never stretch, recolour or redraw the logo."}},
    {"kind": "slide", "data": {"eyebrow": "YOUR TOOLS", "headline": "TWO APPS",
      "body": "Flax HR: punch in and out, see your roster, regularise, check payslips and do your training.\n\nCommand: recipe cards, SOPs, stock and prep. Your manager will show you the parts you need."}},
    {"kind": "slide", "data": {"eyebrow": "THAT'S IT", "headline": "LET'S GO",
      "body": "Answer a few quick questions to finish this module. You need 80% to pass, and you can try again."}}
  ],
  "questions": [
    {"prompt": "In which year did Flax start?", "options": ["2012", "2016", "2019", "2021"], "correct": [1],
     "explanation": "Flax was established in 2016 (ESTD 2016 on the badge)."},
    {"prompt": "What temperature must cold food be kept at?", "options": ["1 to 5 °C", "6 to 10 °C", "Room temperature", "Below -18 °C"], "correct": [0],
     "explanation": "Cold food and cleaned produce are stored at 1 to 5 °C."},
    {"prompt": "How long can cleaned lettuce be used for?", "options": ["12 hours", "24 hours", "48 hours", "Until it looks old"], "correct": [1],
     "explanation": "Cleaned lettuce is labelled with a 24-hour expiry."},
    {"prompt": "Where do you find the exact grams for each ingredient in a dish?", "options": ["Ask a colleague", "The Swiggy menu", "The recipe card in Command", "Guess by eye"], "correct": [2],
     "explanation": "Every dish has a recipe card in Command with exact grams."},
    {"prompt": "Which words do we NOT use when talking about our food?", "kind": "multi", "options": ["Fresh", "Detox", "Guilt-free", "Made this morning"], "correct": [1, 2],
     "explanation": "We say fresh and made this morning; we never say detox or guilt-free."}
  ]
}$j$::jsonb, null);

select training.save_module_doc($j${
  "code": "your-first-week",
  "title": "Your first week",
  "summary": "How attendance, week offs, regularisation and pay work in Flax HR.",
  "kind": "onboarding",
  "est_minutes": 10,
  "pass_mark": 80,
  "sort_order": 2,
  "lessons": [
    {"kind": "text", "title": "Logging in",
     "body": "Open Flax HR on your phone or in any web browser.\n\nChoose Employee, then enter your employee code (it looks like FLAX0123) and your 6-digit PIN.\n\nNever share your PIN. If you forget it, ask HR to reset it."},
    {"kind": "text", "title": "Punching in and out",
     "body": "Punch in when you start your shift and punch out when you finish, every day.\n\nYou need to be inside your outlet, and the app takes a selfie. A day with only one punch counts as a half day, so never skip the punch out."},
    {"kind": "text", "title": "Your shift and hours",
     "body": "A full working day is 9 hours.\n\nWorking 4h 30m or more is a full day (P). Less than that, or a missing punch, is a half day (HD).\n\nComing in more than 15 minutes after your shift start is a late mark. Every 3 late marks cut half a day of pay.\n\nWorking short of 9 hours is cut by the minute. Overtime is paid in whole hours after 10 hours."},
    {"kind": "text", "title": "Week offs",
     "body": "You get one paid week off each week (Monday to Sunday), up to 4 a month.\n\nAsk for it in Regularise and choose Week off. A second day off in the same week is absent unless it is approved leave."},
    {"kind": "text", "title": "Missed a punch, or need leave?",
     "body": "Go to Regularise and pick the right category:\n\nMissed punch: you forgot to punch. Enter the real time you came in or left.\nWeek off: your weekly off.\nSick leave: off sick for the day (paid).\nCasual leave: a personal day off (unpaid).\n\nNever enter a made-up punch for a day off. A punch makes it a working day, and HR will reject it."},
    {"kind": "text", "title": "Pay and payslips",
     "body": "Salary is worked out from your attendance in the app: payable days, short hours, lates and overtime.\n\nYour payslip and the full breakdown are in Payslips and My attendance. All the rules are in Rules & policies."},
    {"kind": "text", "title": "Training",
     "body": "New modules appear in Training. Read every lesson, then take the quiz. Your scores are shared with HR and your manager, so take your time and get it right."}
  ],
  "questions": [
    {"prompt": "How do you log in to Flax HR as an employee?", "options": ["Email and password", "Employee code and 6-digit PIN", "Phone number only", "Your manager logs in for you"], "correct": [1]},
    {"prompt": "You worked 4 hours and punched out. How is the day counted?", "options": ["Full day (P)", "Half day (HD)", "Absent (A)", "Week off"], "correct": [1],
     "explanation": "A full day needs 4h 30m or more."},
    {"prompt": "How many late marks cut half a day of pay?", "options": ["1", "2", "3", "5"], "correct": [2]},
    {"prompt": "How many paid week offs do you get in one Monday-to-Sunday week?", "options": ["None", "One", "Two", "As many as you like"], "correct": [1]},
    {"prompt": "You were off sick yesterday. What do you do?", "options": ["Enter a punch for yesterday", "Regularise with category Sick leave", "Nothing", "Message a colleague"], "correct": [1],
     "explanation": "Pick Sick leave in Regularise. Never enter a punch for a day you did not work."},
    {"prompt": "You forgot to punch out last night. What do you do?", "options": ["Regularise: Missed punch, with the real time you left", "Punch out now", "Ignore it", "Regularise: Casual leave"], "correct": [0]}
  ]
}$j$::jsonb, null);

select training.save_module_doc($j${
  "code": "sop-lettuce-cleaning",
  "title": "Lettuce cleaning",
  "summary": "Cleaning, sanitising and storing lettuce safely. Use cleaned lettuce within 24 hours.",
  "kind": "hygiene",
  "source_url": "https://command.flaxfoods.in",
  "est_minutes": 8,
  "pass_mark": 80,
  "sort_order": 10,
  "lessons": [
    {"kind": "steps", "title": "Lettuce cleaning: step by step",
     "body": "Done daily at every outlet. Steps marked CCP are critical control points: get them wrong and food becomes unsafe.",
     "data": {"steps": [
       {"title": "Packed weight", "body": "Weigh the vendor-packed lettuce bag or box on the kitchen scale before opening. Enter the weight in kg and photograph the pack on the scale.", "target": "0.2 to 10 kg"},
       {"title": "Preparation", "body": "Wash hands thoroughly and wear clean gloves. Sanitise the sink, containers and work surfaces. Use only potable cold water."},
       {"title": "Inspection and sorting", "body": "Remove outer damaged, wilted or discoloured leaves. Check for insects, dirt and foreign material. Discard spoiled or contaminated portions.", "ccp": true},
       {"title": "Separation", "body": "Separate the leaves from the core and place them in a clean container."},
       {"title": "First wash", "body": "Rinse the leaves under cold running potable water to remove soil and debris. Gently agitate so every surface is cleaned.", "ccp": true},
       {"title": "Sanitising", "body": "Prepare the vegetable sanitising solution at the approved concentration. Fully immerse the leaves for 2 to 5 minutes (or as the sanitiser maker says).", "ccp": true, "target": "50 to 200 ppm"},
       {"title": "Final rinse", "body": "Rinse thoroughly with clean potable water if your sanitiser needs it.", "ccp": true},
       {"title": "Drying", "body": "Remove excess water in a salad spinner. Leaves must be properly dry: wet leaves grow bacteria fast."},
       {"title": "Cutting and storage", "body": "Cut with sanitised knives and boards. Put in clean food-grade containers with lids. Label with product name, prep date and expiry (24 hours). Store at 1 to 5 °C.", "ccp": true, "target": "1 to 5 °C"}
     ]}}
  ],
  "questions": [
    {"prompt": "What concentration must the sanitising solution be?", "options": ["5 to 20 ppm", "50 to 200 ppm", "500 to 1000 ppm", "Any amount"], "correct": [1]},
    {"prompt": "How long should the leaves stay in the sanitiser?", "options": ["10 seconds", "2 to 5 minutes", "30 minutes", "Overnight"], "correct": [1]},
    {"prompt": "At what temperature is cleaned lettuce stored?", "options": ["1 to 5 °C", "8 to 12 °C", "Room temperature", "Frozen"], "correct": [0]},
    {"prompt": "What expiry goes on the label of cleaned lettuce?", "options": ["12 hours", "24 hours", "3 days", "1 week"], "correct": [1]},
    {"prompt": "Why must leaves be dried in the salad spinner?", "options": ["They look nicer", "Wet leaves grow bacteria fast", "To save space", "It is optional"], "correct": [1]},
    {"prompt": "Which steps are critical control points (CCP)?", "kind": "multi", "options": ["Inspection and sorting", "Sanitising", "Separation", "Cutting and storage"], "correct": [0, 1, 3]}
  ]
}$j$::jsonb, null);

select training.save_module_doc($j${
  "code": "sop-base-prep",
  "title": "Base prep: couscous, brown rice, quinoa, sweetcorn",
  "summary": "The daily base batches cooked at every outlet in the first shift.",
  "kind": "sop",
  "source_url": "https://command.flaxfoods.in",
  "est_minutes": 10,
  "pass_mark": 80,
  "sort_order": 11,
  "lessons": [
    {"kind": "steps", "title": "Couscous",
     "body": "Cook 5 min at 130 °C. Boil water, add salt and oil, mix well, pour on the raw couscous, cover and leave 5 min. Mix well again to avoid lumps.",
     "data": {"steps": [
       {"title": "Raw couscous", "body": "1 cup", "target": "150 g (135 to 165 g)"},
       {"title": "Boiled water", "body": "1 cup"},
       {"title": "Salt", "body": "1/4 tsp", "target": "1.5 g"},
       {"title": "Oil", "body": "1/2 tsp", "target": "2.5 g"},
       {"title": "Cooked yield", "body": "Weigh before service and photograph the pan.", "target": "322 g (274 to 370 g)"}
     ]}},
    {"kind": "steps", "title": "Brown rice",
     "body": "Cook 18 min at 130 °C. Boil water, add salt and oil, mix, add the raw rice. Cook through and strain the excess water.",
     "data": {"steps": [
       {"title": "Raw brown rice", "body": "1 cup", "target": "200 g (180 to 220 g)"},
       {"title": "Water", "body": "5 cups"},
       {"title": "Salt", "body": "1 tsp", "target": "6 g"},
       {"title": "Oil", "body": "1 tsp", "target": "5 g"},
       {"title": "Cooked yield", "body": "Weigh after straining and photograph the pan.", "target": "584 g (496 to 672 g)"}
     ]}},
    {"kind": "steps", "title": "Quinoa",
     "body": "Cook 24 min at 130 °C. Boil water, add salt and oil, mix, add the raw quinoa. Cook through and strain the excess water.",
     "data": {"steps": [
       {"title": "Raw quinoa", "body": "1 cup", "target": "175 g (158 to 193 g)"},
       {"title": "Water", "body": "5 cups"},
       {"title": "Salt", "body": "1/2 tsp", "target": "3 g"},
       {"title": "Oil", "body": "1 tsp", "target": "5 g"},
       {"title": "Cooked yield", "body": "Weigh after straining and photograph the pan.", "target": "436 g (370 to 502 g)"}
     ]}},
    {"kind": "steps", "title": "Sweetcorn",
     "body": "Cook 5 min at 130 °C. Boil water, add salt, mix, add the raw sweetcorn, cook 5 min and strain the excess water.",
     "data": {"steps": [
       {"title": "Raw sweetcorn", "body": "1 cup", "target": "150 g (135 to 165 g)"},
       {"title": "Water", "body": "5 cups"},
       {"title": "Salt", "body": "1/2 tsp", "target": "3 g"},
       {"title": "Cooked yield", "body": "Weigh after straining and photograph the pan.", "target": "150 g (128 to 173 g)"}
     ]}}
  ],
  "questions": [
    {"prompt": "How long is quinoa cooked?", "options": ["5 min", "12 min", "18 min", "24 min"], "correct": [3]},
    {"prompt": "How long is brown rice cooked?", "options": ["5 min", "18 min", "24 min", "40 min"], "correct": [1]},
    {"prompt": "What induction temperature are the bases cooked at?", "options": ["100 °C", "130 °C", "180 °C", "220 °C"], "correct": [1]},
    {"prompt": "How much raw quinoa goes into one batch?", "options": ["100 g", "150 g", "175 g", "250 g"], "correct": [2]},
    {"prompt": "Couscous: after pouring the boiled water on, what do you do?", "options": ["Boil it for 20 min", "Cover and leave 5 min, then mix well", "Strain it straight away", "Fry it"], "correct": [1]},
    {"prompt": "What do you do with every cooked batch before service?", "options": ["Taste it only", "Weigh it and photograph the pan", "Nothing", "Freeze half"], "correct": [1]}
  ]
}$j$::jsonb, null);

select training.save_module_doc($j${
  "code": "sop-deep-clean",
  "title": "Deep clean",
  "summary": "The kitchen and outlet deep clean, done twice in any 7 days.",
  "kind": "hygiene",
  "source_url": "https://command.flaxfoods.in",
  "est_minutes": 8,
  "pass_mark": 80,
  "sort_order": 12,
  "lessons": [
    {"kind": "steps", "title": "Deep clean: step by step",
     "body": "Run on Monday, Wednesday or Sunday: twice in any 7-day window. Photograph each step for the audit record.",
     "data": {"steps": [
       {"title": "Preparation", "body": "Wear PPE (gloves, apron, hair net). Put a Cleaning in progress sign at all entrances. Lay out chemicals, microfibre cloths, brushes and a fresh sanitiser bucket."},
       {"title": "Refrigeration deep clean", "body": "Empty the fridges (move stock to the backup chiller). Remove shelves and gaskets, wash with hot soapy water, sanitise and dry. Photograph the clean interior. Record the temperature after the door has been closed for 10 min.", "ccp": true, "target": "1 to 5 °C"},
       {"title": "Cooking surfaces, hoods, vents", "body": "Degrease the range, griddle, hob and the walls behind. Soak hood filters in degreaser, then rinse. Wipe vents and ducts. Sanitise all stainless surfaces.", "ccp": true},
       {"title": "Prep counters and cutting boards", "body": "Strip all prep counters and sanitise at the approved concentration. Submerge cutting boards in sanitiser for the required contact time. Record the concentration.", "ccp": true, "target": "50 to 200 ppm"},
       {"title": "Floor and drains", "body": "Sweep and mop, including behind equipment. Pour drain enzyme cleaner down all floor drains. Scrub the drain covers."},
       {"title": "Handwash sinks and dispensers", "body": "Descale taps. Refill soap dispensers. Replace paper towel rolls. Sanitise the basin."},
       {"title": "Final inspection", "body": "Walk every zone. No visible grease, soil, food debris or odour. Photograph the clean kitchen for the audit record."}
     ]}}
  ],
  "questions": [
    {"prompt": "How often is the deep clean done?", "options": ["Once a month", "Twice in any 7 days", "Only when it looks dirty", "Every hour"], "correct": [1]},
    {"prompt": "Which PPE do you wear for the deep clean?", "kind": "multi", "options": ["Gloves", "Apron", "Hair net", "Sunglasses"], "correct": [0, 1, 2]},
    {"prompt": "After cleaning the fridge, what temperature should it show (door closed 10 min)?", "options": ["1 to 5 °C", "8 to 10 °C", "0 °C exactly", "Any"], "correct": [0]},
    {"prompt": "Where does stock go while a fridge is being cleaned?", "options": ["On the counter", "The backup chiller", "Thrown away", "Outside"], "correct": [1]},
    {"prompt": "What concentration should the sanitiser for counters and boards be?", "options": ["50 to 200 ppm", "5 to 10 ppm", "1000 ppm", "No sanitiser needed"], "correct": [0]}
  ]
}$j$::jsonb, null);

-- Paths (switched off until reviewed).
do $$
declare v uuid;
begin
  if not exists (select 1 from training.paths where name = 'All staff: welcome') then
    insert into training.paths (name, description, due_days, is_active)
    values ('All staff: welcome', 'Brand introduction and first-week basics for every employee.', 7, false)
    returning id into v;
    insert into training.path_modules (path_id, module_id, position)
    select v, id, case code when 'welcome-to-flax' then 1 else 2 end
    from training.modules where code in ('welcome-to-flax', 'your-first-week');
  end if;

  if not exists (select 1 from training.paths where name = 'Kitchen: food safety and base prep') then
    insert into training.paths (name, description, roster_groups, due_days, is_active)
    values ('Kitchen: food safety and base prep', 'Daily kitchen SOPs from Command for every kitchen role.', array['kitchen'], 14, false)
    returning id into v;
    insert into training.path_modules (path_id, module_id, position)
    select v, id, case code when 'sop-lettuce-cleaning' then 1 when 'sop-base-prep' then 2 else 3 end
    from training.modules where code in ('sop-lettuce-cleaning', 'sop-base-prep', 'sop-deep-clean');
  end if;

  if not exists (select 1 from training.paths where name = 'Outlet teams: hygiene') then
    insert into training.paths (name, description, roster_groups, due_days, is_active)
    values ('Outlet teams: hygiene', 'Deep clean SOP for service, barista and outlet management.', array['service', 'barista', 'management'], 14, false)
    returning id into v;
    insert into training.path_modules (path_id, module_id, position)
    select v, id, 1 from training.modules where code = 'sop-deep-clean';
  end if;
end $$;
