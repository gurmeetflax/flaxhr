-- Flax HR — starter document templates. HR edits these in the app.
-- Placeholders are filled per employee; the letterhead, date, company
-- signature and the employee's acceptance block are added around the body.
-- Starter wording — have it reviewed by your lawyer before relying on it.

insert into core.doc_templates (kind, title, sign_method, audience, body) values
('offer_letter', 'Offer of Employment', 'aadhaar', 'new_joiner', $tpl$
<p>Dear {{name}},</p>
<p>We are pleased to offer you the position of <b>{{designation}}</b> with {{company_name}} (trading as Flax), based in <b>{{city}}</b>. You may be posted at any of the Company's outlets, kitchens or offices as business needs require. Your expected date of joining is <b>{{joining_date}}</b>.</p>
<h3>Compensation</h3>
<p>Your gross monthly salary will be <b>₹{{gross_monthly}}</b> (annual CTC ₹{{ctc_annual}}), structured as follows:</p>
{{salary_table}}
<p>Salary is paid monthly in arrears into your bank account, after statutory deductions applicable to you.</p>
<h3>Key terms</h3>
<ul>
<li>Probation: {{probation_months}} months from your date of joining.</li>
<li>Working hours: {{shift_hours}} hours per shift as per the published roster, with {{week_offs}} week offs per month.</li>
<li>Notice period: {{notice_probation}} days during probation and {{notice_confirmed}} days after confirmation.</li>
</ul>
<p>Your detailed terms of employment will be set out in your appointment letter, which you will receive on joining.</p>
<p>This offer is valid until <b>{{offer_valid_till}}</b> and is subject to satisfactory verification of your identity documents and references.</p>
<p>We look forward to welcoming you to the Flax family.</p>
$tpl$),

('appointment_letter', 'Letter of Appointment', 'aadhaar', 'all', $tpl$
<p>Dear {{name}},</p>
<p>{{company_name}} (trading as Flax) ("the Company") is pleased to confirm your appointment on the following terms.</p>
<h3>1. Position and place of work</h3>
<p>You are appointed as <b>{{designation}}</b> (Employee Code {{employee_code}}), based in <b>{{city}}</b>, effective <b>{{joining_date}}</b>. You may be posted at, or moved between, any of the Company's outlets, kitchens or offices as business needs require.</p>
<h3>2. Compensation</h3>
<p>Your gross monthly salary is <b>₹{{gross_monthly}}</b> (annual CTC ₹{{ctc_annual}}), structured as follows:</p>
{{salary_table}}
<p>Applicable statutory deductions (Provident Fund, ESIC, Professional Tax, TDS) will be made as per law. Salary is paid monthly for days attended and approved paid leave.</p>
<h3>3. Probation and confirmation</h3>
<p>You will be on probation for {{probation_months}} months. The Company may extend probation or confirm your employment based on your performance and conduct.</p>
<h3>4. Hours, roster and attendance</h3>
<p>Your working hours are {{shift_hours}} hours per shift as per the published roster, with {{week_offs}} week offs per month. Attendance must be marked by punching in and out on the Flax HR app every shift. Week offs are paid only when applied for and approved through the app.</p>
<h3>5. Duties</h3>
<p>You will perform the duties of your role{{duties_sentence}} and any other reasonable duties assigned to you, following the Company's standards for food safety, hygiene, grooming and guest service.</p>
<h3>6. Leave</h3>
<p>You are entitled to leave as per the Company's leave policy, applied for and approved through the Flax HR app.</p>
<h3>7. Notice and termination</h3>
<p>Either party may end this employment by giving {{notice_probation}} days' notice during probation, or {{notice_confirmed}} days' notice after confirmation, or salary in lieu of notice. The Company may terminate employment without notice for misconduct, including dishonesty, theft, violence, harassment, serious breach of food-safety or hygiene rules, or unauthorised absence.</p>
<h3>8. Confidentiality and policies</h3>
<p>You will keep the Company's recipes, suppliers, prices, customer data and business information confidential, and follow all Company policies as updated from time to time, including those you sign separately.</p>
<h3>9. Company property</h3>
<p>Uniforms, equipment and any Company property must be returned on leaving. Unreturned items or agreed recoveries may be adjusted against your final settlement.</p>
<p>This letter, together with the Company's policies, forms your terms of employment.</p>
$tpl$),

('attendance_policy', 'Attendance & App Punching Policy', 'in_app', 'all', $tpl$
<p>This policy applies to all employees of {{company_name}} (Flax).</p>
<ol>
<li><b>Punch every shift.</b> You must punch in when you start and punch out when you finish every shift, on the Flax HR app (hr.flaxfoods.in or the Flax HR mobile app), from your work location.</li>
<li><b>No punch, no attendance.</b> A day without an app punch is treated as absent and may lead to a deduction in salary. Punching for another person, or asking someone to punch for you, is a serious offence.</li>
<li><b>Missed or wrong punch.</b> If you forget to punch or a punch is wrong, raise a regularisation request in the app on the same day or the next day, with the reason. Approval is at the manager's / HR's discretion.</li>
<li><b>Roster.</b> Report for the shift shown on your published roster. Arriving late or leaving early without approval is recorded and may lead to a warning card.</li>
<li><b>Week offs and leave.</b> Week offs and leave are paid only when applied for and approved in the app. Unapproved absence is unpaid.</li>
<li><b>Location and selfie.</b> The app may check your location and ask for a selfie when you punch. Do not try to bypass these checks.</li>
<li><b>Repeated lates or absences</b> lead to yellow and red cards, a performance improvement plan, and can result in termination.</li>
</ol>
<p>I, {{name}} ({{employee_code}}), have read and understood this policy and agree to follow it.</p>
$tpl$),

('conduct_policy', 'Leave, Week Off & Code of Conduct', 'in_app', 'all', $tpl$
<p>This policy applies to all employees of {{company_name}} (Flax).</p>
<h3>Leave and week offs</h3>
<ul>
<li>You get {{week_offs}} week offs per month as per the roster. Week offs are paid only when requested and approved in the Flax HR app.</li>
<li>Other leave must be applied for in advance in the app. Emergency leave must be informed to your manager on the same day and applied for in the app.</li>
<li>Absence without approval for 3 or more consecutive days may be treated as abandonment of employment.</li>
</ul>
<h3>Grooming and uniform</h3>
<ul>
<li>Wear the issued uniform, clean and complete, every shift. Hair tied and covered in the kitchen, nails short, no jewellery on hands in food areas.</li>
<li>Follow food-safety, hygiene and allergen rules at all times.</li>
</ul>
<h3>Conduct</h3>
<ul>
<li>Treat guests and colleagues with respect. Harassment, abuse, discrimination or violence of any kind is not tolerated.</li>
<li>No alcohol, tobacco or drugs at work or before your shift.</li>
<li>Do not take food, cash or company property without authorisation.</li>
<li>Use your phone only on breaks, except for work.</li>
</ul>
<h3>Cards and discipline</h3>
<p>Breaches are recorded as yellow or red cards in the Flax HR app. Repeated cards lead to a performance improvement plan, salary impact as per policy, or termination. Serious misconduct can lead to immediate termination.</p>
<h3>Grievances</h3>
<p>You can raise a grievance confidentially in the Flax HR app at any time. Raising a genuine concern will never be held against you.</p>
<p>I, {{name}} ({{employee_code}}), have read and understood this policy and agree to follow it.</p>
$tpl$),

('nda', 'Confidentiality Agreement', 'in_app', 'all', $tpl$
<p>This agreement is between {{company_name}} (trading as Flax) ("the Company") and {{name}} ({{employee_code}}), {{designation}} ("you").</p>
<ol>
<li><b>Confidential information</b> includes the Company's recipes, menus in development, preparation methods, supplier and vendor details, purchase prices, sales and financial data, customer and employee information, systems and business plans.</li>
<li><b>You will not</b> share, copy, photograph, post on social media or use confidential information for anyone other than the Company, during your employment or after it ends.</li>
<li><b>On leaving</b>, you will return or delete all Company documents, recipes, data and property in your possession.</li>
<li><b>Customer and employee data</b> may be used only for your work and must be protected.</li>
<li><b>Breach</b> of this agreement may lead to disciplinary action, termination and legal action for damages.</li>
<li>This agreement continues after your employment ends.</li>
</ol>
<p>I, {{name}}, agree to keep the Company's information confidential as set out above.</p>
$tpl$),

('deduction_consent', 'Uniform & Deduction Consent', 'in_app', 'uniform', $tpl$
<p>I, {{name}} ({{employee_code}}), {{designation}}, acknowledge that I have received uniform items from {{company_name}} (Flax).</p>
<ul>
<li>I agree that the uniform cost of <b>₹{{uniform_amount}}</b> may be recovered from my salary in <b>{{uniform_months}}</b> monthly instalments of <b>₹{{uniform_monthly}}</b>.</li>
<li>If I leave before the recovery is complete, I agree that the balance may be adjusted against my final settlement.</li>
<li>I will keep the uniform clean and in good condition and return it on leaving where required.</li>
</ul>
<p>I give this consent voluntarily.</p>
$tpl$)
on conflict (kind) do nothing;
