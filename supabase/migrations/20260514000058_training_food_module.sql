-- Training: "Know our food". The menu families, small vs large portions,
-- and 8 signature dishes from command's chef-approved recipe cards
-- (Inventory project: flax_outlet_recipe with the approved changes in
-- flax_recipe_override applied, packaging left out) as they stood on
-- 17 Nov 2026. Photos, calories, protein and allergens come from the Food
-- Database menu listing. Given to all staff through "All staff: welcome".

select training.save_module_doc($j${
 "code": "food-signature-dishes",
 "title": "Know our food",
 "summary": "Our menu, small and large portions, and 8 signature dishes from the chef-approved recipe cards.",
 "kind": "recipe",
 "source_url": "https://command.flaxfoods.in",
 "est_minutes": 15,
 "pass_mark": 70,
 "sort_order": 5,
 "lessons": [
  {
   "kind": "slide",
   "data": {
    "icon": "salad",
    "eyebrow": "THE MENU",
    "headline": "WHAT WE SERVE",
    "body": "Fresh, healthy food in a few families:\n\n- **Super bowls:** veg and non-veg\n- **Signature salads**\n- **Wholesome wraps** and **sourdough sandwiches**\n- **High protein meals** and **healthy hot mains**\n- **Smoothie bowls and parfaits**\n- **Breakfast classics**, healthy snacks and desserts"
   }
  },
  {
   "kind": "slide",
   "data": {
    "icon": "chef",
    "eyebrow": "HOW IT'S BUILT",
    "headline": "SMALL AND LARGE",
    "body": "Bowls and salads come in two sizes. The recipe card gives grams for each.\n\n- **Protein:** 60 g in a small, 120 g in a large\n- **Dressing:** 50 g in a small, 100 g in a large\n- **Greens:** 40 g in a small, 80 g in a large\n- **Crunch and toppings:** seeds, ragi chips, microgreens, as on the card"
   }
  },
  {
   "kind": "slide",
   "data": {
    "icon": "scale",
    "eyebrow": "GET IT RIGHT",
    "headline": "SAME DISH EVERY TIME",
    "body": "The recipe cards below are the chef-approved cards. Weigh every ingredient to the gram, so a guest gets the same dish at every outlet, every day.\n\n**Veg and non-veg:** use separate boards, tongs and containers, and never mix them.\n\n**Allergens:** if a guest asks, check before you answer."
   }
  },
  {
   "kind": "recipe",
   "title": "Shawarma Paneer Bowl",
   "body": "Shawarma paneer, roasted garlic hummus, potato wedges, pickled veggies, olives, roasted red pepper and chickpeas, greens, ragi chips and microgreens, with orange chipotle tahini.",
   "data": {
    "ingredients": [
     {
      "name": "Lettuce Mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled Chickpeas",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Roasted Red Bell Pepper",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Grilled Paneer",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Shawarma Marination",
      "qty_s": "15 g",
      "qty_l": "20 g"
     },
     {
      "name": "Pickle Veg",
      "qty_s": "30 g",
      "qty_l": "30 g"
     },
     {
      "name": "Baked Potato Wedges",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Orange Chipotle Tahina",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Roasted Garlic Hummus",
      "qty_s": "50 g",
      "qty_l": "80 g"
     },
     {
      "name": "Flax Seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Ragi Chips",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Black Olive Slice",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     }
    ],
    "veg": true,
    "kcal": 509,
    "protein_g": 24,
    "category": "Veg Super Bowls"
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/shawarma-paneer-bowl/1777542478918-ciscpm.jpg"
  },
  {
   "kind": "recipe",
   "title": "Mexican Bowl",
   "body": "Grilled paneer, guacamole, salsa crudo, mixed beans, sweet corn, greens, ragi chips, Greek yoghurt and microgreens, with smoky-sweet chipotle mango dressing.",
   "data": {
    "ingredients": [
     {
      "name": "Lettuce Mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled Sweet Corn",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Grilled Paneer",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Salsa Crudo",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Ragi Chips",
      "qty_s": "15 g",
      "qty_l": "20 g"
     },
     {
      "name": "Greek Yoghurt",
      "qty_s": "50 g",
      "qty_l": "50 g"
     },
     {
      "name": "Chipotle Mango Dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Flax Seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Guacamole",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Mixed Beans",
      "qty_s": "30 g",
      "qty_l": "60 g"
     }
    ],
    "veg": true,
    "kcal": 635,
    "protein_g": 27,
    "category": "Veg Super Bowls"
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/mexican-bowl/1777543750215-wdjeaa.png"
  },
  {
   "kind": "recipe",
   "title": "Mediterranean Bowl",
   "body": "Grilled paneer, couscous, roasted vegetables, broccoli, beetroot hummus and roasted garlic hummus, feta, walnuts and greens, with basil pesto dressing.",
   "data": {
    "ingredients": [
     {
      "name": "Lettuce Mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Grilled Paneer",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Boiled Couscous",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Roasted Vegetable",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Blanched Broccoli",
      "qty_s": "20 g",
      "qty_l": "40 g"
     },
     {
      "name": "Basil Pesto Dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Cheese Feta",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Roasted Walnut",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Flax Seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Beetroot Hummus",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Roasted Garlic Hummus",
      "qty_s": "40 g",
      "qty_l": "80 g"
     }
    ],
    "veg": true,
    "kcal": 626,
    "protein_g": 20,
    "category": "Veg Super Bowls"
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/mediterranean-bowl/1777542059995-lgflz4.jpg"
  },
  {
   "kind": "recipe",
   "title": "Flax Caesar Salad",
   "body": "Grilled chicken, avocado, croutons, greens, parmesan, dried cranberries and pumpkin seeds, with creamy ranch dressing.",
   "data": {
    "ingredients": [
     {
      "name": "Lettuce Mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Grilled Chicken",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Imported Avocado",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Cranberry Dried",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Cheese Parmesan",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Croutons",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Pumpkin Seed",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Creamy Ranch Dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     }
    ],
    "veg": false,
    "kcal": 493,
    "protein_g": 36,
    "category": "Non-veg Signature Salads"
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/flax-caesar-salad/1777555136316-m64y28.jpg"
  },
  {
   "kind": "recipe",
   "title": "Quinoa and Avocado Salad",
   "body": "Quinoa, avocado, chickpeas, greens, tomato, cucumber, red bell pepper, onion, dragon fruit, feta and walnuts, with lemon olive oil dressing.",
   "data": {
    "ingredients": [
     {
      "name": "Lettuce Mix",
      "qty_s": "40 g"
     },
     {
      "name": "Boiled Quinoa",
      "qty_s": "100 g"
     },
     {
      "name": "Imported Avocado",
      "qty_s": "120 g"
     },
     {
      "name": "English Cucumber",
      "qty_s": "30 g"
     },
     {
      "name": "Red Bell Pepper",
      "qty_s": "30 g"
     },
     {
      "name": "Onion Big",
      "qty_s": "30 g"
     },
     {
      "name": "Roasted Walnut",
      "qty_s": "15 g"
     },
     {
      "name": "Dragon Fruit",
      "qty_s": "60 g"
     },
     {
      "name": "Micro Greens",
      "qty_s": "5 g"
     },
     {
      "name": "Boiled Chickpeas",
      "qty_s": "30 g"
     },
     {
      "name": "Cheese Feta",
      "qty_s": "15 g"
     },
     {
      "name": "Lemon Olive Oil Dressing",
      "qty_s": "50 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g"
     }
    ],
    "veg": true,
    "kcal": 647,
    "protein_g": 19,
    "category": "Veg Signature Salads"
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/quinoa-avocado-salad/1777547312923-tzajwl.jpg"
  },
  {
   "kind": "recipe",
   "title": "Shawarma Paneer Wrap",
   "body": "Shawarma paneer in a multigrain wrap with sun-dried tomato hummus, greens, potato wedges, pickled veggies, onion, tomato, feta and jalapeño, with orange tahini.",
   "data": {
    "ingredients": [
     {
      "name": "Multigrain Wrap 10 Inch",
      "qty_s": "1 pc"
     },
     {
      "name": "Sundried Tomato Hummus",
      "qty_s": "30 g"
     },
     {
      "name": "Lettuce Mix",
      "qty_s": "25 g"
     },
     {
      "name": "Grilled Paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Shawarma Marination",
      "qty_s": "20 g"
     },
     {
      "name": "Baked Potato Wedges",
      "qty_s": "50 g"
     },
     {
      "name": "Pickle Veg",
      "qty_s": "20 g"
     },
     {
      "name": "Orange Chipotle Tahina",
      "qty_s": "15 g"
     },
     {
      "name": "Onion Big",
      "qty_s": "20 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g"
     },
     {
      "name": "Cheese Feta",
      "qty_s": "15 g"
     },
     {
      "name": "Jalapeno Sliced",
      "qty_s": "5 g"
     }
    ],
    "veg": true,
    "kcal": 691,
    "protein_g": 44,
    "category": "Veg Wholesome Wraps",
    "allergens": [
     "Dairy",
     "Sesame",
     "Gluten"
    ]
   }
  },
  {
   "kind": "recipe",
   "title": "Avocado and Garlic Butter Rye Toast",
   "body": "Sourdough toast with roasted garlic butter, chunky avocado, red radish, micro greens and flax seeds.",
   "data": {
    "ingredients": [
     {
      "name": "Sourdough Bread Slice",
      "qty_s": "1 pc"
     },
     {
      "name": "Garlic Butter",
      "qty_s": "20 g"
     },
     {
      "name": "Imported Avocado",
      "qty_s": "100 g"
     },
     {
      "name": "Radish Red",
      "qty_s": "5 g"
     },
     {
      "name": "Micro Greens",
      "qty_s": "5 g"
     },
     {
      "name": "Flax Seeds",
      "qty_s": "2 g"
     }
    ],
    "veg": true,
    "kcal": 523,
    "protein_g": 9,
    "category": "Breakfast Classics"
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/avocado-and-garlic-butter-rye-toast-high/1777698152385-kygnpv.avif"
  },
  {
   "kind": "recipe",
   "title": "Mocha Smoothie Bowl",
   "body": "Mocha smoothie topped with banana, granola, whole almonds and choco chips.",
   "data": {
    "ingredients": [
     {
      "name": "Mocha Smoothie",
      "qty_s": "1 portion"
     },
     {
      "name": "Banana",
      "qty_s": "0.5 pc"
     },
     {
      "name": "Granola",
      "qty_s": "30 g"
     },
     {
      "name": "Almond Whole",
      "qty_s": "15 g"
     },
     {
      "name": "Choco Chips",
      "qty_s": "15 g"
     }
    ],
    "veg": true,
    "kcal": 576,
    "protein_g": 12,
    "category": "Smoothie Bowls & Parfaits",
    "allergens": [
     "Dairy",
     "Nuts"
    ]
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/mocha-smoothie-bowl-gluten-free-low-cal/1777698280564-blqyut.avif"
  }
 ],
 "questions": [
  {
   "prompt": "How much grilled paneer goes into a small Shawarma Paneer Bowl?",
   "options": [
    "30 g",
    "60 g",
    "90 g",
    "120 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much grilled paneer goes into a large Mediterranean Bowl?",
   "options": [
    "60 g",
    "90 g",
    "120 g",
    "150 g"
   ],
   "correct": [
    2
   ],
   "explanation": "Small bowls get 60 g of protein, large bowls 120 g."
  },
  {
   "prompt": "How much chipotle mango dressing goes into a large Mexican Bowl?",
   "options": [
    "50 g",
    "80 g",
    "100 g",
    "150 g"
   ],
   "correct": [
    2
   ]
  },
  {
   "prompt": "Which of these go into the Mexican Bowl?",
   "kind": "multi",
   "options": [
    "Guacamole",
    "Mixed beans",
    "Greek yoghurt",
    "Croutons"
   ],
   "correct": [
    0,
    1,
    2
   ]
  },
  {
   "prompt": "Which grain is in the Mediterranean Bowl?",
   "options": [
    "Quinoa",
    "Boiled couscous",
    "Brown rice",
    "Buckwheat noodles"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "Which hummus goes into the Mediterranean Bowl now?",
   "kind": "multi",
   "options": [
    "Beetroot hummus",
    "Roasted garlic hummus",
    "Sun-dried tomato hummus",
    "Pumpkin moutabel"
   ],
   "correct": [
    0,
    1
   ],
   "explanation": "The chef changed this card: beetroot and roasted garlic hummus replaced sun-dried tomato hummus and pumpkin moutabel."
  },
  {
   "prompt": "Which dressing goes on the Quinoa and Avocado Salad?",
   "options": [
    "Lemon olive oil dressing",
    "Garlic mustard dressing",
    "Creamy ranch dressing",
    "Basil pesto dressing"
   ],
   "correct": [
    0
   ],
   "explanation": "The card now uses lemon olive oil dressing instead of garlic mustard."
  },
  {
   "prompt": "How much avocado goes on the Avocado and Garlic Butter Rye Toast?",
   "options": [
    "60 g",
    "100 g",
    "120 g",
    "240 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much granola goes on the Mocha Smoothie Bowl?",
   "options": [
    "15 g",
    "20 g",
    "30 g",
    "50 g"
   ],
   "correct": [
    2
   ]
  },
  {
   "prompt": "Which allergens are in the Shawarma Paneer Wrap?",
   "kind": "multi",
   "options": [
    "Dairy",
    "Sesame",
    "Gluten",
    "Shellfish"
   ],
   "correct": [
    0,
    1,
    2
   ]
  }
 ]
}$j$::jsonb, null);

insert into training.path_modules (path_id, module_id, position)
select p.id, m.id, coalesce((select max(position) + 1 from training.path_modules where path_id = p.id), 1)
from training.paths p, training.modules m
where p.name = 'All staff: welcome' and m.code = 'food-signature-dishes'
on conflict do nothing;

select training.sync_paths();
