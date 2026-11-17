-- Welcome to Flax: staff don't use Command. Name the apps they do use
-- (HR, Outlet, Inventory, Auditor) and stop pointing recipe cards at
-- Command. Text only; nothing else changes.

do $$
declare v_mod uuid;
begin
  select id into v_mod from training.modules where code = 'welcome-to-flax';
  if v_mod is null then return; end if;

  update training.lessons
     set data = data || jsonb_build_object(
           'headline', 'FOUR APPS',
           'body', E'HR app: punch in and out, see your roster, regularise, check payslips and do your training.\n\nOutlet app: day-to-day work at your outlet.\n\nInventory app: stock and orders.\n\nAuditor app: audits and checks at your outlet.\n\nYour manager will show you the ones you use.')
   where module_id = v_mod and data ->> 'eyebrow' = 'YOUR TOOLS';

  update training.lessons
     set data = data || jsonb_build_object(
           'body', E'Bowls, salads, smoothies, parfaits and more, built on bases we cook fresh every morning.\n\nEvery dish has a recipe card with exact grams for each ingredient. The guest should get the same dish every time, at every outlet.')
   where module_id = v_mod and data ->> 'eyebrow' = 'THE FOOD';

  update training.questions
     set options = '["Ask a colleague", "The Swiggy menu", "The recipe card", "Guess by eye"]'::jsonb,
         explanation = 'Every dish has a recipe card with exact grams for each ingredient.'
   where module_id = v_mod and prompt like 'Where do you find the exact grams%';
end $$;
