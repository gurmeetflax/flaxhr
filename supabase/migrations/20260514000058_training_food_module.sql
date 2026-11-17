-- Training: "Know our food". The menu families, how a bowl is built, and
-- 8 signature dishes with their recipe (ingredients and grams), photo,
-- calories, protein and allergens, from the Food Database (public.dishes)
-- as it stood on 17 Nov 2026. Given to all staff through the
-- "All staff: welcome" path.

select training.save_module_doc($j${
 "code": "food-signature-dishes",
 "title": "Know our food",
 "summary": "Our menu, how a bowl is built, and 8 signature dishes with exact grams.",
 "kind": "recipe",
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
    "headline": "BUILD A BOWL",
    "body": "Most bowls, salads and wraps are built the same way:\n\n- **Base or greens:** lettuce mix, brown rice, quinoa or buckwheat noodles\n- **Protein:** 60 g grilled paneer, chicken or tofu. The **High protein meals** get 120 g.\n- **Veggies and crunch:** roasted and fresh veggies, beans, flax seeds, ragi chips\n- **Dressing:** weighed every time"
   }
  },
  {
   "kind": "slide",
   "data": {
    "icon": "scale",
    "eyebrow": "GET IT RIGHT",
    "headline": "SAME DISH EVERY TIME",
    "body": "Weigh every ingredient to the gram on the recipe card. A guest should get the same dish at every outlet, every day.\n\n**Veg and non-veg:** use separate boards, tongs and containers, and never mix them.\n\n**Allergens:** every dish lists them. If a guest asks, check before you answer."
   }
  },
  {
   "kind": "recipe",
   "title": "Shawarma Paneer Bowl (small)",
   "body": "Shawarma paneer, roasted garlic hummus, potato wedges, pickled veggies, olives, roasted red pepper and chickpea salad, hydroponic greens and ragi chips, with orange chipotle tahini.",
   "data": {
    "ingredients": [
     {
      "name": "Lettuce Mix",
      "qty_s": "35 g"
     },
     {
      "name": "Boiled Chickpeas",
      "qty_s": "30 g"
     },
     {
      "name": "Roasted Red Bell Peppers",
      "qty_s": "5 g"
     },
     {
      "name": "Black Olive Slice",
      "qty_s": "5 g"
     },
     {
      "name": "Grilled Paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Shawarma Marination",
      "qty_s": "15 g"
     },
     {
      "name": "Pickle Veg",
      "qty_s": "20 g"
     },
     {
      "name": "Baked Potato Wedges",
      "qty_s": "30 g"
     },
     {
      "name": "Orange Chipotle Tahina",
      "qty_s": "50 g"
     },
     {
      "name": "Roasted Garlic Hummus",
      "qty_s": "50 g"
     },
     {
      "name": "Flax Seeds",
      "qty_s": "2 g"
     },
     {
      "name": "Ragi Chips",
      "qty_s": "15 g"
     },
     {
      "name": "Lettuce Mix",
      "qty_s": "50 g"
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
   "title": "Noods Chicken Bowl",
   "body": "Buckwheat noodles, satay chicken, broccoli, mushroom, beansprouts, edamame, red cabbage, carrots, spring onion and fried onions, with our nutty ginger dressing.",
   "data": {
    "ingredients": [
     {
      "name": "Grilled Chicken",
      "qty_s": "60 g"
     },
     {
      "name": "Peanut Sauce",
      "qty_s": "15 g"
     },
     {
      "name": "Boiled Buckwheat Noodles",
      "qty_s": "160 g"
     },
     {
      "name": "Red Cabbage",
      "qty_s": "20 g"
     },
     {
      "name": "Carrot English",
      "qty_s": "30 g"
     },
     {
      "name": "Blanched Broccoli",
      "qty_s": "30 g"
     },
     {
      "name": "Grilled Mushroom",
      "qty_s": "30 g"
     },
     {
      "name": "Edamame Frozen",
      "qty_s": "20 g"
     },
     {
      "name": "Bean Sprouts",
      "qty_s": "20 g"
     },
     {
      "name": "Spring Onion",
      "qty_s": "5 g"
     },
     {
      "name": "Fried Onions",
      "qty_s": "5 g"
     },
     {
      "name": "Nutty Ginger Dressing",
      "qty_s": "50 g"
     },
     {
      "name": "Peanut Sauce",
      "qty_s": "50 g"
     }
    ],
    "veg": false,
    "kcal": 804,
    "protein_g": 43,
    "category": "Non-veg Super Bowls"
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/noods-chicken-bowl/1777616822914-92x4ho.jpg"
  },
  {
   "kind": "recipe",
   "title": "BBQ Chicken Salad",
   "body": "BBQ chicken, roasted red pepper, caramelised onion, tomato, mixed greens, mixed beans, cheddar, cream cheese, olives, jalapeño and croutons, with garlic mustard dressing.",
   "data": {
    "ingredients": [
     {
      "name": "Lettuce Mix",
      "qty_s": "35 g"
     },
     {
      "name": "Grilled Chicken",
      "qty_s": "60 g"
     },
     {
      "name": "Bbq Sauce",
      "qty_s": "20 g"
     },
     {
      "name": "Boiled Black Beans",
      "qty_s": "20 g"
     },
     {
      "name": "Boiled Black Eyed Beans",
      "qty_s": "20 g"
     },
     {
      "name": "Boiled Kidney Beans",
      "qty_s": "20 g"
     },
     {
      "name": "Caramalized Onions",
      "qty_s": "20 g"
     },
     {
      "name": "Black Olive Slice",
      "qty_s": "20 g"
     },
     {
      "name": "Roasted Red Bell Peppers",
      "qty_s": "20 g"
     },
     {
      "name": "Spring Onion",
      "qty_s": "5 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g"
     },
     {
      "name": "Roasted Tomato",
      "qty_s": "50 g"
     },
     {
      "name": "Cheddar Cheese Slice",
      "qty_s": "1 pc"
     },
     {
      "name": "Cream Cheese Spread",
      "qty_s": "50 g"
     },
     {
      "name": "Jalapeno Sliced",
      "qty_s": "20 g"
     },
     {
      "name": "Croutons",
      "qty_s": "40 g"
     },
     {
      "name": "Garlic Mustard Dressing",
      "qty_s": "50 g"
     }
    ],
    "veg": false,
    "kcal": 420,
    "protein_g": 32,
    "category": "Non-veg Signature Salads"
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/bbq-chicken-salad/1777548140694-sj9vhy.jpg"
  },
  {
   "kind": "recipe",
   "title": "Asian Cottage Cheese",
   "body": "Grilled cottage cheese on brown rice with crisp carrot and red cabbage slaw, nutty ginger and Korean dressings.",
   "data": {
    "ingredients": [
     {
      "name": "Grilled Paneer",
      "qty_s": "120 g"
     },
     {
      "name": "Chipotle Paste",
      "qty_s": "30 g"
     },
     {
      "name": "Boiled Brown Rice",
      "qty_s": "120 g"
     },
     {
      "name": "Lemon Olive Oil Dressing",
      "qty_s": "10 g"
     },
     {
      "name": "Spring Onion",
      "qty_s": "5 g"
     },
     {
      "name": "Carrot",
      "qty_s": "40 g"
     },
     {
      "name": "Red Cabbage",
      "qty_s": "40 g"
     },
     {
      "name": "Nutty Ginger Dressing",
      "qty_s": "60 g"
     },
     {
      "name": "Korean Dressing",
      "qty_s": "50 g"
     },
     {
      "name": "Flax Seeds",
      "qty_s": "2 g"
     }
    ],
    "veg": true,
    "kcal": 637,
    "protein_g": 24,
    "category": "Veg High Protein Meals",
    "allergens": [
     "Dairy",
     "Soy"
    ]
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/asian-cottage-cheese/1777544516088-83cyuj.jpg"
  },
  {
   "kind": "recipe",
   "title": "Chipotle Chicken Meal",
   "body": "Chipotle grilled chicken with hearty mixed beans and veggies, finished with a smoky-sweet chipotle mango dressing.",
   "data": {
    "ingredients": [
     {
      "name": "Grilled Chicken",
      "qty_s": "120 g"
     },
     {
      "name": "Chipotle Mango Dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Chipotle Paste",
      "qty_s": "20 g"
     },
     {
      "name": "Boiled Black Beans",
      "qty_s": "30 g"
     },
     {
      "name": "Boiled Black Eyed Beans",
      "qty_s": "30 g"
     },
     {
      "name": "Boiled Kidney Beans",
      "qty_s": "30 g"
     },
     {
      "name": "Lemon Olive Oil Dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Onion",
      "qty_s": "20 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g"
     },
     {
      "name": "Red Bell Pepper",
      "qty_s": "20 g"
     },
     {
      "name": "Flax Seeds",
      "qty_s": "2 g"
     }
    ],
    "veg": false,
    "kcal": 503,
    "protein_g": 34,
    "category": "Non-veg High Protein Meals"
   },
   "media_url": "https://otergzwwbcoaqruwajud.supabase.co/storage/v1/object/public/plan-images/dishes/chipotle-chicken-meal/1777549953568-ffh40g.jpg"
  },
  {
   "kind": "recipe",
   "title": "Shawarma Paneer Wrap",
   "body": "Shawarma paneer in a multigrain tortilla with hummus, pickled veggies, greens, potato wedges and feta, finished with orange tahini dressing.",
   "data": {
    "ingredients": [
     {
      "name": "Multigrain Wrap 8 Inch",
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
      "name": "Fajita Vegetable",
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
   "body": "Sourdough toast with roasted garlic butter, chunky mashed avocado, micro greens and flax seeds.",
   "data": {
    "ingredients": [
     {
      "name": "Sourdough Bread Slice",
      "qty_s": "1 slice"
     },
     {
      "name": "Garlic Butter",
      "qty_s": "20 g"
     },
     {
      "name": "Guacamole",
      "qty_s": "120 g"
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
   "body": "Dark chocolate, coffee, banana, zucchini and dates blended into a bowl, topped with almonds, granola and dark chocolate.",
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
      "qty_s": "20 g"
     },
     {
      "name": "Almond Whole",
      "qty_s": "15 g"
     },
     {
      "name": "Dark Chocolate 15 Ns",
      "qty_s": "5 g"
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
   "prompt": "How much grilled chicken goes into the Noods Chicken Bowl?",
   "options": [
    "30 g",
    "60 g",
    "120 g",
    "200 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much grilled chicken goes into the Chipotle Chicken Meal (a high protein meal)?",
   "options": [
    "60 g",
    "90 g",
    "120 g",
    "150 g"
   ],
   "correct": [
    2
   ],
   "explanation": "High protein meals get 120 g of protein; bowls, salads and wraps get 60 g."
  },
  {
   "prompt": "Which noodles are in the Noods Chicken Bowl?",
   "options": [
    "Rice noodles",
    "Buckwheat noodles",
    "Egg noodles",
    "Wheat noodles"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "What is the base of the Asian Cottage Cheese meal?",
   "options": [
    "Quinoa",
    "Boiled brown rice",
    "Couscous",
    "Buckwheat noodles"
   ],
   "correct": [
    1
   ],
   "explanation": "120 g of boiled brown rice."
  },
  {
   "prompt": "Which hummus goes into the Shawarma Paneer Bowl?",
   "options": [
    "Roasted garlic hummus",
    "Beetroot hummus",
    "Plain hummus",
    "No hummus"
   ],
   "correct": [
    0
   ]
  },
  {
   "prompt": "How much guacamole goes on the Avocado and Garlic Butter Rye Toast?",
   "options": [
    "40 g",
    "80 g",
    "120 g",
    "200 g"
   ],
   "correct": [
    2
   ]
  },
  {
   "prompt": "Which dressing goes on the BBQ Chicken Salad?",
   "options": [
    "Garlic mustard dressing",
    "Caesar dressing",
    "Nutty ginger dressing",
    "Lemon olive oil"
   ],
   "correct": [
    0
   ]
  },
  {
   "prompt": "What goes on top of the Mocha Smoothie Bowl?",
   "kind": "multi",
   "options": [
    "Granola",
    "Whole almonds",
    "Dark chocolate",
    "Croutons"
   ],
   "correct": [
    0,
    1,
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
  },
  {
   "prompt": "A guest wants a veg version of a chicken bowl. Which protein is used instead?",
   "options": [
    "Grilled paneer or tofu",
    "Extra cheese only",
    "No protein",
    "Boiled egg"
   ],
   "correct": [
    0
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
