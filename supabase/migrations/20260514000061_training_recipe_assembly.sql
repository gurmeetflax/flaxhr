-- Training: outlet recipe assembly. Five modules built from command's
-- chef-approved recipe cards (Inventory project: flax_outlet_recipe with the
-- approved changes in flax_recipe_override applied, packaging left out) as
-- they stood on 18 Nov 2026, with command's own dish photos (cafe-menu
-- bucket). Chickpea and Mushroom Stroganoff and Protein Coffee Smoothie are
-- left out: command has no base recipe for them yet.
--
-- Given to kitchen staff at every outlet (not the central kitchen) through a
-- new path "Outlet kitchen: recipe assembly", due in 21 days.
--
-- Also: "Know our food" uses command's photos for the three bowls command
-- has photos of.

select training.save_module_doc($j${
 "code": "assembly-bowls",
 "title": "Assembly: bowls",
 "summary": "Chef-approved assembly cards from Command: 10 dishes with grams for every ingredient.",
 "kind": "recipe",
 "source_url": "https://command.flaxfoods.in",
 "est_minutes": 25,
 "pass_mark": 70,
 "sort_order": 20,
 "lessons": [
  {
   "kind": "slide",
   "data": {
    "icon": "chef",
    "eyebrow": "BOWLS",
    "headline": "HOW WE ASSEMBLE",
    "body": "Build every bowl the same way, every time:\n\n- **Base first:** greens and grains at the bottom\n- **Then protein**, then toppings, then crunch\n- **Dressing on the side** in the 50 ml cup\n- **Small and large** have different grams: check the size on the KOT\n- **Weigh, don't guess.** The grams below are the chef-approved card in Command."
   }
  },
  {
   "kind": "slide",
   "data": {
    "icon": "package",
    "eyebrow": "PACKING",
    "headline": "PACK IT RIGHT",
    "body": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Shawarma Paneer Bowl",
   "data": {
    "veg": true,
    "category": "Bowl",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled chickpeas",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Black olives, sliced",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Roasted red bell pepper",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Shawarma marination",
      "qty_s": "15 g",
      "qty_l": "20 g"
     },
     {
      "name": "Pickled veggies",
      "qty_s": "30 g",
      "qty_l": "30 g"
     },
     {
      "name": "Baked potato wedges",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Orange chipotle tahini",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "50 g",
      "qty_l": "80 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Ragi chips",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-VSB09.jpg"
  },
  {
   "kind": "recipe",
   "title": "Mexican Bowl",
   "data": {
    "veg": true,
    "category": "Bowl",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled sweet corn",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Salsa crudo",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Ragi chips",
      "qty_s": "15 g",
      "qty_l": "20 g"
     },
     {
      "name": "Greek yoghurt",
      "qty_s": "50 g",
      "qty_l": "50 g"
     },
     {
      "name": "Chipotle mango dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Guacamole",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Mixed beans",
      "qty_s": "30 g",
      "qty_l": "60 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-VSB10.jpg"
  },
  {
   "kind": "recipe",
   "title": "Mediterranean Bowl",
   "data": {
    "veg": true,
    "category": "Bowl",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Boiled couscous",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Roasted vegetable",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Blanched broccoli",
      "qty_s": "20 g",
      "qty_l": "40 g"
     },
     {
      "name": "Basil pesto dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Roasted walnuts",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Beetroot hummus",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-116.jpg"
  },
  {
   "kind": "recipe",
   "title": "The Burrito Bowl",
   "data": {
    "veg": true,
    "category": "Bowl",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled brown rice",
      "qty_s": "40 g",
      "qty_l": "60 g"
     },
     {
      "name": "Onion",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Refried beans",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Salsa crudo",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled sweet corn",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Chipotle mango dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Tomato",
      "qty_s": "30 g",
      "qty_l": "30 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Guacamole",
      "qty_s": "40 g",
      "qty_l": "80 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-122.jpg"
  },
  {
   "kind": "recipe",
   "title": "Falafel Bowl",
   "data": {
    "veg": true,
    "category": "Bowl",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled couscous",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Falafel patty",
      "qty_s": "2 pc",
      "qty_l": "4 pc"
     },
     {
      "name": "Beetroot hummus",
      "qty_s": "50 g",
      "qty_l": "80 g"
     },
     {
      "name": "Onion",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Ragi chips",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Red radish",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "50 g",
      "qty_l": "80 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Glow Bowl",
   "data": {
    "veg": true,
    "category": "Bowl",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled chickpeas",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Boiled quinoa",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Carrot",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Red radish",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Avocado",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Roasted beetroot",
      "qty_s": "50 g",
      "qty_l": "50 g"
     },
     {
      "name": "Dried cranberries",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Chia seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "50 g",
      "qty_l": "50 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-50.jpg"
  },
  {
   "kind": "recipe",
   "title": "Jain Glow Bowl",
   "data": {
    "veg": true,
    "category": "Bowl",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g"
     },
     {
      "name": "Boiled chickpeas",
      "qty_s": "60 g"
     },
     {
      "name": "Boiled quinoa",
      "qty_s": "60 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g"
     },
     {
      "name": "Avocado",
      "qty_s": "60 g"
     },
     {
      "name": "Dried cranberries",
      "qty_s": "15 g"
     },
     {
      "name": "Chia seeds",
      "qty_s": "2 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g"
     },
     {
      "name": "Green zucchini",
      "qty_s": "30 g"
     },
     {
      "name": "Yellow zucchini",
      "qty_s": "30 g"
     },
     {
      "name": "Mango chipotle dressing",
      "qty_s": "50 g"
     }
    ],
    "plating": "Jain: no onion, garlic or root vegetables. Use clean tongs and boards. Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-50.jpg"
  },
  {
   "kind": "recipe",
   "title": "Gluten-free Glow Salad Bowl",
   "data": {
    "veg": true,
    "category": "Bowl",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled chickpeas",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Boiled quinoa",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Carrot",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Red radish",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Avocado",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Roasted beetroot",
      "qty_s": "50 g",
      "qty_l": "50 g"
     },
     {
      "name": "Dried cranberries",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Chia seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Mango chipotle dressing",
      "qty_s": "50 g",
      "qty_l": "50 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-50.jpg"
  },
  {
   "kind": "recipe",
   "title": "Chilli Garlic Noods Bowl",
   "data": {
    "veg": true,
    "category": "Bowl",
    "ingredients": [
     {
      "name": "Grilled tofu",
      "qty_s": "60 g"
     },
     {
      "name": "Boiled buckwheat noodles",
      "qty_s": "160 g"
     },
     {
      "name": "Peanut sauce",
      "qty_s": "15 g"
     },
     {
      "name": "Red cabbage",
      "qty_s": "20 g"
     },
     {
      "name": "Carrot",
      "qty_s": "30 g"
     },
     {
      "name": "Blanched broccoli",
      "qty_s": "30 g"
     },
     {
      "name": "Grilled mushroom",
      "qty_s": "30 g"
     },
     {
      "name": "Edamame",
      "qty_s": "20 g"
     },
     {
      "name": "Fried onions",
      "qty_s": "5 g"
     },
     {
      "name": "Nutty ginger dressing",
      "qty_s": "50 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Coconut Curry Bowl",
   "data": {
    "veg": true,
    "category": "Bowl",
    "ingredients": [
     {
      "name": "Grilled tofu",
      "qty_s": "60 g"
     },
     {
      "name": "Coconut curry",
      "qty_s": "100 g"
     },
     {
      "name": "Boiled brown rice",
      "qty_s": "60 g"
     },
     {
      "name": "Carrot koshimbir",
      "qty_s": "50 g"
     },
     {
      "name": "English cucumber",
      "qty_s": "60 g"
     },
     {
      "name": "Pomegranate",
      "qty_s": "60 g"
     },
     {
      "name": "Mango salsa",
      "qty_s": "30 g"
     },
     {
      "name": "Pickled veggies",
      "qty_s": "30 g"
     },
     {
      "name": "Avocado",
      "qty_s": "60 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  }
 ],
 "questions": [
  {
   "prompt": "How much grilled tofu goes into the Coconut Curry Bowl?",
   "options": [
    "60 g",
    "70 g",
    "80 g",
    "120 g"
   ],
   "correct": [
    0
   ]
  },
  {
   "prompt": "How much avocado goes into a large Glow Bowl?",
   "options": [
    "30 g",
    "60 g",
    "80 g",
    "120 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much beetroot hummus goes into a small Falafel Bowl?",
   "options": [
    "40 g",
    "50 g",
    "60 g",
    "100 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much Greek yoghurt goes into a large Mexican Bowl?",
   "options": [
    "25 g",
    "50 g",
    "60 g",
    "75 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much boiled quinoa goes into a large Gluten-free Glow Salad Bowl?",
   "options": [
    "50 g",
    "60 g",
    "80 g",
    "90 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much grilled paneer goes into a small Burrito Bowl?",
   "options": [
    "30 g",
    "60 g",
    "70 g",
    "80 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "Which of these go into the Shawarma Paneer Bowl?",
   "kind": "multi",
   "options": [
    "Tomato",
    "Orange chipotle tahini",
    "Shawarma marination",
    "Red radish"
   ],
   "correct": [
    1,
    2
   ]
  },
  {
   "prompt": "Which of these go into the Mexican Bowl?",
   "kind": "multi",
   "options": [
    "Guacamole",
    "Boiled quinoa",
    "Onion",
    "Grilled paneer"
   ],
   "correct": [
    0,
    3
   ]
  }
 ]
}$j$::jsonb, null);

select training.save_module_doc($j${
 "code": "assembly-salads",
 "title": "Assembly: salads",
 "summary": "Chef-approved assembly cards from Command: 13 dishes with grams for every ingredient.",
 "kind": "recipe",
 "source_url": "https://command.flaxfoods.in",
 "est_minutes": 31,
 "pass_mark": 70,
 "sort_order": 21,
 "lessons": [
  {
   "kind": "slide",
   "data": {
    "icon": "chef",
    "eyebrow": "BOWLS",
    "headline": "HOW WE ASSEMBLE",
    "body": "Build every bowl the same way, every time:\n\n- **Base first:** greens and grains at the bottom\n- **Then protein**, then toppings, then crunch\n- **Dressing on the side** in the 50 ml cup\n- **Small and large** have different grams: check the size on the KOT\n- **Weigh, don't guess.** The grams below are the chef-approved card in Command."
   }
  },
  {
   "kind": "slide",
   "data": {
    "icon": "package",
    "eyebrow": "PACKING",
    "headline": "PACK IT RIGHT",
    "body": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Flax Caesar Salad",
   "data": {
    "veg": false,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Grilled chicken",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Avocado",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Dried cranberries",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Parmesan cheese",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Croutons",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Pumpkin seeds",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Creamy ranch dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Quinoa and Avocado Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g"
     },
     {
      "name": "Boiled quinoa",
      "qty_s": "100 g"
     },
     {
      "name": "Avocado",
      "qty_s": "120 g"
     },
     {
      "name": "English cucumber",
      "qty_s": "30 g"
     },
     {
      "name": "Red bell pepper",
      "qty_s": "30 g"
     },
     {
      "name": "Onion",
      "qty_s": "30 g"
     },
     {
      "name": "Roasted walnuts",
      "qty_s": "15 g"
     },
     {
      "name": "Dragon fruit",
      "qty_s": "60 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     },
     {
      "name": "Boiled chickpeas",
      "qty_s": "30 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "50 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Jain Quinoa and Avocado Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g"
     },
     {
      "name": "Boiled quinoa",
      "qty_s": "100 g"
     },
     {
      "name": "Avocado",
      "qty_s": "120 g"
     },
     {
      "name": "Cherry tomato",
      "qty_s": "20 g"
     },
     {
      "name": "English cucumber",
      "qty_s": "30 g"
     },
     {
      "name": "Red bell pepper",
      "qty_s": "30 g"
     },
     {
      "name": "Roasted walnuts",
      "qty_s": "15 g"
     },
     {
      "name": "Dragon fruit",
      "qty_s": "60 g"
     },
     {
      "name": "Boiled chickpeas",
      "qty_s": "30 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g"
     },
     {
      "name": "Mango chipotle dressing",
      "qty_s": "50 g"
     }
    ],
    "plating": "Jain: no onion, garlic or root vegetables. Use clean tongs and boards. Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Summer Refresh Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled quinoa",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Carrot",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Dried cranberries",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Pomegranate",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Whole almonds",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Chia seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Mango chipotle dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-47.jpg"
  },
  {
   "kind": "recipe",
   "title": "Gluten-free Summer Refresh Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled quinoa",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Dried cranberries",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Pomegranate",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Whole almonds",
      "qty_s": "15 g",
      "qty_l": "15 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g",
      "qty_l": ""
     },
     {
      "name": "Chia seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Mango chipotle dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-47.jpg"
  },
  {
   "kind": "recipe",
   "title": "Flax High Protein Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled chickpeas",
      "qty_s": "20 g",
      "qty_l": "30 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g",
      "qty_l": "40 g"
     },
     {
      "name": "English cucumber",
      "qty_s": "20 g",
      "qty_l": "40 g"
     },
     {
      "name": "Black olives, sliced",
      "qty_s": "20 g",
      "qty_l": "30 g"
     },
     {
      "name": "Pomegranate",
      "qty_s": "20 g",
      "qty_l": "30 g"
     },
     {
      "name": "Roasted walnuts",
      "qty_s": "10 g",
      "qty_l": "20 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g",
      "qty_l": "20 g"
     },
     {
      "name": "Grilled tofu",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Mixed beans",
      "qty_s": "60 g",
      "qty_l": "60 g"
     },
     {
      "name": "Orange chipotle tahini dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Ragi chips",
      "qty_s": "20 g",
      "qty_l": "20 g"
     },
     {
      "name": "Pickled veggies",
      "qty_s": "30 g",
      "qty_l": "30 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Basilico Veg Pasta Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Whole wheat fusilli",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Boiled sweet corn",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "40 g",
      "qty_l": "80 g"
     },
     {
      "name": "Red bell pepper",
      "qty_s": "20 g",
      "qty_l": "30 g"
     },
     {
      "name": "Black olives, sliced",
      "qty_s": "20 g",
      "qty_l": "30 g"
     },
     {
      "name": "Bocconcini",
      "qty_s": "1 pc",
      "qty_l": "2 pc"
     },
     {
      "name": "Croutons",
      "qty_s": "20 g",
      "qty_l": "30 g"
     },
     {
      "name": "Balsamic glaze",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Basil pesto dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Grilled tofu",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g",
      "qty_l": "30 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Tokyo Soba Salad",
   "data": {
    "veg": null,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Yellow zucchini",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Green zucchini",
      "qty_s": "30 g",
      "qty_l": "60 g"
     },
     {
      "name": "Red bell pepper",
      "qty_s": "20 g",
      "qty_l": "30 g"
     },
     {
      "name": "Red cabbage",
      "qty_s": "20 g",
      "qty_l": "40 g"
     },
     {
      "name": "Pickled cucumber",
      "qty_s": "15 g",
      "qty_l": "30 g"
     },
     {
      "name": "Roasted peanuts",
      "qty_s": "20 g",
      "qty_l": "30 g"
     },
     {
      "name": "Mixed sesame seeds",
      "qty_s": "2 g",
      "qty_l": "2 g"
     },
     {
      "name": "Korean dressing",
      "qty_s": "50 g",
      "qty_l": "100 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g",
      "qty_l": "5 g"
     },
     {
      "name": "Grilled tofu, chicken or paneer (as ordered)",
      "qty_s": "60 g",
      "qty_l": "120 g"
     },
     {
      "name": "Boiled buckwheat noodles",
      "qty_s": "80 g",
      "qty_l": "160 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Korean Sesame Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Grilled tofu",
      "qty_s": "60 g"
     },
     {
      "name": "Red cabbage",
      "qty_s": "50 g"
     },
     {
      "name": "Red bell pepper",
      "qty_s": "25 g"
     },
     {
      "name": "Spring onion",
      "qty_s": "5 g"
     },
     {
      "name": "Carrot",
      "qty_s": "75 g"
     },
     {
      "name": "Bean sprouts",
      "qty_s": "25 g"
     },
     {
      "name": "English cucumber",
      "qty_s": "20 g"
     },
     {
      "name": "Edamame",
      "qty_s": "15 g"
     },
     {
      "name": "Fried onions",
      "qty_s": "5 g"
     },
     {
      "name": "Korean dressing",
      "qty_s": "100 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Smoky BBQ Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "BBQ sauce",
      "qty_s": "20 g"
     },
     {
      "name": "Caramelised onions",
      "qty_s": "20 g"
     },
     {
      "name": "Black olives, sliced",
      "qty_s": "20 g"
     },
     {
      "name": "Roasted red bell pepper",
      "qty_s": "25 g"
     },
     {
      "name": "Roasted tomatoes",
      "qty_s": "50 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g"
     },
     {
      "name": "Cheddar cheese slice",
      "qty_s": "1 pc"
     },
     {
      "name": "Cream cheese",
      "qty_s": "50 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "15 g"
     },
     {
      "name": "Croutons",
      "qty_s": "40 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "50 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     },
     {
      "name": "Mixed beans",
      "qty_s": "60 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-44.jpg"
  },
  {
   "kind": "recipe",
   "title": "Mexican Taco Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Chipotle paste",
      "qty_s": "15 g"
     },
     {
      "name": "Boiled sweet corn",
      "qty_s": "60 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "15 g"
     },
     {
      "name": "Avocado",
      "qty_s": "60 g"
     },
     {
      "name": "Orange",
      "qty_s": "50 g"
     },
     {
      "name": "Cheddar cheese slice",
      "qty_s": "1 pc"
     },
     {
      "name": "Cream cheese",
      "qty_s": "50 g"
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
      "name": "Mango chipotle dressing",
      "qty_s": "50 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     },
     {
      "name": "Mixed beans",
      "qty_s": "60 g"
     },
     {
      "name": "Nacho chips",
      "qty_s": "40 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-60.jpg"
  },
  {
   "kind": "recipe",
   "title": "Roasted Mediterranean Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g"
     },
     {
      "name": "Roasted vegetable",
      "qty_s": "50 g"
     },
     {
      "name": "Roasted red bell pepper",
      "qty_s": "25 g"
     },
     {
      "name": "Caramelised onions",
      "qty_s": "25 g"
     },
     {
      "name": "Roasted tomatoes",
      "qty_s": "20 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "20 g"
     },
     {
      "name": "Black olives, sliced",
      "qty_s": "15 g"
     },
     {
      "name": "Croutons",
      "qty_s": "40 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "30 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "50 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Roasted beetroot",
      "qty_s": "50 g"
     },
     {
      "name": "Roasted walnuts",
      "qty_s": "15 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Sweet Potato Avocado Salad",
   "data": {
    "veg": true,
    "category": "Salad",
    "ingredients": [
     {
      "name": "Roasted sweet potato",
      "qty_s": "120 g"
     },
     {
      "name": "Avocado",
      "qty_s": "100 g"
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
      "name": "Mango salsa",
      "qty_s": "50 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     },
     {
      "name": "Nacho chips",
      "qty_s": "40 g"
     }
    ],
    "plating": "Small: 1050 ml hexagon bowl with lid, dressing in one 50 ml cup. Large: 1300 ml kraft round bowl, dressing in two 50 ml cups. Sleeve, wooden spork, printed paper bag."
   }
  }
 ],
 "questions": [
  {
   "prompt": "How much grilled paneer goes into the Smoky BBQ Salad?",
   "options": [
    "30 g",
    "50 g",
    "60 g",
    "70 g"
   ],
   "correct": [
    2
   ]
  },
  {
   "prompt": "How much lemon olive oil dressing goes into the Roasted Mediterranean Salad?",
   "options": [
    "25 g",
    "40 g",
    "50 g",
    "100 g"
   ],
   "correct": [
    2
   ]
  },
  {
   "prompt": "How much boiled buckwheat noodles goes into a small Tokyo Soba Salad?",
   "options": [
    "70 g",
    "80 g",
    "90 g",
    "120 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much mango chipotle dressing goes into a small Gluten-free Summer Refresh Salad?",
   "options": [
    "25 g",
    "40 g",
    "50 g",
    "60 g"
   ],
   "correct": [
    2
   ]
  },
  {
   "prompt": "How much Korean dressing goes into the Korean Sesame Salad?",
   "options": [
    "50 g",
    "100 g",
    "110 g",
    "200 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much avocado goes into a large Flax Caesar Salad?",
   "options": [
    "30 g",
    "60 g",
    "70 g",
    "80 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "Which of these go into the Tokyo Soba Salad?",
   "kind": "multi",
   "options": [
    "Red cabbage",
    "Avocado",
    "Bean sprouts",
    "Mixed sesame seeds"
   ],
   "correct": [
    0,
    3
   ]
  },
  {
   "prompt": "Which of these go into the Roasted Mediterranean Salad?",
   "kind": "multi",
   "options": [
    "Roasted red bell pepper",
    "Orange chipotle tahini dressing",
    "Grilled chicken",
    "Roasted vegetable"
   ],
   "correct": [
    0,
    3
   ]
  }
 ]
}$j$::jsonb, null);

select training.save_module_doc($j${
 "code": "assembly-wraps",
 "title": "Assembly: wraps",
 "summary": "Chef-approved assembly cards from Command: 14 dishes with grams for every ingredient.",
 "kind": "recipe",
 "source_url": "https://command.flaxfoods.in",
 "est_minutes": 33,
 "pass_mark": 70,
 "sort_order": 22,
 "lessons": [
  {
   "kind": "slide",
   "data": {
    "icon": "chef",
    "eyebrow": "WRAPS",
    "headline": "HOW WE ASSEMBLE",
    "body": "Every wrap the same way:\n\n- **Warm the wrap** and spread the hummus or sauce first\n- **Greens, then protein,** then toppings and the dressing on top\n- **Gluten-free orders get the beetroot wrap**\n- **Roll tight,** cut through the middle, wrap in butter paper\n- **Weigh, don't guess.** The grams below are the chef-approved card in Command."
   }
  },
  {
   "kind": "slide",
   "data": {
    "icon": "package",
    "eyebrow": "PACKING",
    "headline": "PACK IT RIGHT",
    "body": "Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Shawarma Paneer Wrap",
   "data": {
    "veg": true,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Sundried tomato hummus",
      "qty_s": "30 g"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "25 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Shawarma marination",
      "qty_s": "20 g"
     },
     {
      "name": "Baked potato wedges",
      "qty_s": "50 g"
     },
     {
      "name": "Pickled veggies",
      "qty_s": "20 g"
     },
     {
      "name": "Orange chipotle tahini",
      "qty_s": "15 g"
     },
     {
      "name": "Onion",
      "qty_s": "20 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "5 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g"
     },
     {
      "name": "Multigrain wrap (10 inch)",
      "qty_s": "1 pc"
     }
    ],
    "plating": "Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Paneer Tikka Wrap",
   "data": {
    "veg": true,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "30 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Tikka marination",
      "qty_s": "10 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g"
     },
     {
      "name": "Salsa verde dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "5 g"
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
      "name": "Multigrain wrap (10 inch)",
      "qty_s": "1 pc"
     }
    ],
    "plating": "Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Hummus and Paneer Wrap",
   "data": {
    "veg": true,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "30 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "5 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "10 g"
     },
     {
      "name": "Multigrain wrap (10 inch)",
      "qty_s": "1 pc"
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
      "name": "Roasted garlic hummus",
      "qty_s": "30 g"
     }
    ],
    "plating": "Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-140.jpg"
  },
  {
   "kind": "recipe",
   "title": "Falafel Wrap",
   "data": {
    "veg": true,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g"
     },
     {
      "name": "Beetroot hummus",
      "qty_s": "30 g"
     },
     {
      "name": "Falafel patty",
      "qty_s": "2 pc"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "5 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Multigrain wrap (10 inch)",
      "qty_s": "1 pc"
     },
     {
      "name": "Onion",
      "qty_s": "20 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g"
     }
    ],
    "plating": "Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-141.jpg"
  },
  {
   "kind": "recipe",
   "title": "Mediterranean Falafel Wrap",
   "data": {
    "veg": true,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Multigrain wrap (10 inch)",
      "qty_s": "1 pc"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "25 g"
     },
     {
      "name": "Black bean patty",
      "qty_s": "2 pc"
     },
     {
      "name": "Onion",
      "qty_s": "20 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "10 g"
     },
     {
      "name": "Pickled veggies",
      "qty_s": "20 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "10 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g"
     },
     {
      "name": "Tomato",
      "qty_s": "20 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "30 g"
     }
    ],
    "plating": "Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Blackbean Mushroom Wrap",
   "data": {
    "veg": true,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Multigrain wrap (10 inch)",
      "qty_s": "1 pc"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "25 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "30 g"
     },
     {
      "name": "Carrot",
      "qty_s": "20 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "10 g"
     },
     {
      "name": "Nutty ginger dressing",
      "qty_s": "15 g"
     },
     {
      "name": "Onion",
      "qty_s": "30 g"
     },
     {
      "name": "Tomato",
      "qty_s": "30 g"
     },
     {
      "name": "Black beans",
      "qty_s": "10 g"
     },
     {
      "name": "Falafel patty",
      "qty_s": "2 pc"
     },
     {
      "name": "Grilled mushroom",
      "qty_s": "10 g"
     }
    ],
    "plating": "Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-145.jpg"
  },
  {
   "kind": "recipe",
   "title": "Grilled Chicken Wrap",
   "data": {
    "veg": false,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Lettuce mix",
      "qty_s": "40 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "30 g"
     },
     {
      "name": "Grilled chicken",
      "qty_s": "60 g"
     },
     {
      "name": "Basil pesto dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Black olives, sliced",
      "qty_s": "5 g"
     },
     {
      "name": "Roasted tomatoes",
      "qty_s": "15 g"
     },
     {
      "name": "Caramelised onions",
      "qty_s": "15 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "15 g"
     },
     {
      "name": "Multigrain wrap (10 inch)",
      "qty_s": "1 pc"
     }
    ],
    "plating": "Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-135.jpg"
  },
  {
   "kind": "recipe",
   "title": "Caesar Chicken Wrap",
   "data": {
    "veg": false,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Multigrain wrap (10 inch)",
      "qty_s": "1 pc"
     },
     {
      "name": "Grilled chicken",
      "qty_s": "60 g"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "25 g"
     },
     {
      "name": "Cream cheese",
      "qty_s": "30 g"
     },
     {
      "name": "Avocado",
      "qty_s": "60 g"
     },
     {
      "name": "Parmesan cheese",
      "qty_s": "15 g"
     },
     {
      "name": "Creamy ranch dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Roasted tomatoes",
      "qty_s": "30 g"
     }
    ],
    "plating": "Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-139.jpg"
  },
  {
   "kind": "recipe",
   "title": "Gluten-free Hummus and Paneer Wrap",
   "data": {
    "veg": true,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Beetroot wrap",
      "qty_s": "1 pc"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "25 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "5 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "10 g"
     },
     {
      "name": "Onion",
      "qty_s": "30 g"
     },
     {
      "name": "Tomato",
      "qty_s": "30 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "30 g"
     }
    ],
    "plating": "Gluten-free: use the beetroot wrap, never the multigrain wrap. Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Gluten-free Falafel Wrap",
   "data": {
    "veg": true,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Beetroot wrap",
      "qty_s": "1 pc"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "25 g"
     },
     {
      "name": "Beetroot hummus",
      "qty_s": "30 g"
     },
     {
      "name": "Falafel patty",
      "qty_s": "2 pc"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "5 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Onion",
      "qty_s": "30 g"
     },
     {
      "name": "Tomato",
      "qty_s": "30 g"
     }
    ],
    "plating": "Gluten-free: use the beetroot wrap, never the multigrain wrap. Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Gluten-free Peri Peri Paneer Wrap",
   "data": {
    "veg": true,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Beetroot wrap",
      "qty_s": "1 pc"
     },
     {
      "name": "Creamy ranch dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "20 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Peri peri sauce",
      "qty_s": "30 g"
     },
     {
      "name": "Onion",
      "qty_s": "30 g"
     },
     {
      "name": "Tomato",
      "qty_s": "30 g"
     }
    ],
    "plating": "Gluten-free: use the beetroot wrap, never the multigrain wrap. Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Gluten-free Tandoori Paneer Avocado Wrap",
   "data": {
    "veg": true,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Beetroot wrap",
      "qty_s": "1 pc"
     },
     {
      "name": "Creamy ranch dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "20 g"
     },
     {
      "name": "Onion",
      "qty_s": "15 g"
     },
     {
      "name": "Red bell pepper",
      "qty_s": "15 g"
     },
     {
      "name": "English cucumber",
      "qty_s": "20 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Tikka marination",
      "qty_s": "20 g"
     },
     {
      "name": "Avocado",
      "qty_s": "30 g"
     }
    ],
    "plating": "Gluten-free: use the beetroot wrap, never the multigrain wrap. Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-VWW07.jpg"
  },
  {
   "kind": "recipe",
   "title": "Gluten-free Grilled Chicken Wrap",
   "data": {
    "veg": false,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Beetroot wrap",
      "qty_s": "1 pc"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "25 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "30 g"
     },
     {
      "name": "Basil pesto dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Grilled chicken",
      "qty_s": "60 g"
     },
     {
      "name": "Black olives, sliced",
      "qty_s": "10 g"
     },
     {
      "name": "Roasted tomatoes",
      "qty_s": "20 g"
     },
     {
      "name": "Caramelised onions",
      "qty_s": "15 g"
     },
     {
      "name": "Lemon olive oil dressing",
      "qty_s": "20 g"
     }
    ],
    "plating": "Gluten-free: use the beetroot wrap, never the multigrain wrap. Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Gluten-free Shawarma Chicken Wrap",
   "data": {
    "veg": false,
    "category": "Wrap",
    "ingredients": [
     {
      "name": "Beetroot wrap",
      "qty_s": "1 pc"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "20 g"
     },
     {
      "name": "Grilled chicken",
      "qty_s": "60 g"
     },
     {
      "name": "Shawarma marination",
      "qty_s": "20 g"
     },
     {
      "name": "Baked potato wedges",
      "qty_s": "50 g"
     },
     {
      "name": "Pickled veggies",
      "qty_s": "20 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "10 g"
     },
     {
      "name": "Orange chipotle tahini",
      "qty_s": "15 g"
     },
     {
      "name": "Feta cheese",
      "qty_s": "15 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "30 g"
     }
    ],
    "plating": "Gluten-free: use the beetroot wrap, never the multigrain wrap. Roll tight, wrap in butter paper and pack in the 750 ml kraft box. Sleeve and printed paper bag."
   }
  }
 ],
 "questions": [
  {
   "prompt": "How much basil pesto dressing goes into the Gluten-free Grilled Chicken Wrap?",
   "options": [
    "10 g",
    "20 g",
    "30 g",
    "40 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much lemon olive oil dressing goes into the Hummus and Paneer Wrap?",
   "options": [
    "5 g",
    "10 g",
    "20 g",
    "30 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much avocado goes into the Gluten-free Tandoori Paneer Avocado Wrap?",
   "options": [
    "20 g",
    "30 g",
    "40 g",
    "50 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much nutty ginger dressing goes into the Blackbean Mushroom Wrap?",
   "options": [
    "5 g",
    "15 g",
    "30 g",
    "35 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much orange chipotle tahini goes into the Gluten-free Shawarma Chicken Wrap?",
   "options": [
    "5 g",
    "15 g",
    "30 g",
    "35 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much beetroot hummus goes into the Gluten-free Falafel Wrap?",
   "options": [
    "15 g",
    "30 g",
    "45 g",
    "50 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "Which of these go into the Gluten-free Peri Peri Paneer Wrap?",
   "kind": "multi",
   "options": [
    "Onion",
    "Lemon olive oil dressing",
    "Black beans",
    "Beetroot wrap"
   ],
   "correct": [
    0,
    3
   ]
  },
  {
   "prompt": "Which of these go into the Gluten-free Tandoori Paneer Avocado Wrap?",
   "kind": "multi",
   "options": [
    "Avocado",
    "Grilled chicken",
    "Tikka marination",
    "Salsa verde dressing"
   ],
   "correct": [
    0,
    2
   ]
  }
 ]
}$j$::jsonb, null);

select training.save_module_doc($j${
 "code": "assembly-sandwiches-meals",
 "title": "Assembly: sandwiches, toast and meals",
 "summary": "Chef-approved assembly cards from Command: 10 dishes with grams for every ingredient.",
 "kind": "recipe",
 "source_url": "https://command.flaxfoods.in",
 "est_minutes": 25,
 "pass_mark": 70,
 "sort_order": 23,
 "lessons": [
  {
   "kind": "slide",
   "data": {
    "icon": "chef",
    "eyebrow": "SANDWICHES, TOAST AND MEALS",
    "headline": "HOW WE ASSEMBLE",
    "body": "Get these right every time:\n\n- **Sandwiches:** sourdough slices, cream cheese spread edge to edge, fillings evenly spread, toast and cut\n- **Meals and pasta:** grain or pasta first, protein on top, sauce as on the card\n- **Pasta:** one protein, as ordered on the KOT\n- **Weigh, don't guess.** The grams below are the chef-approved card in Command."
   }
  },
  {
   "kind": "slide",
   "data": {
    "icon": "package",
    "eyebrow": "PACKING",
    "headline": "PACK IT RIGHT",
    "body": "Sandwiches and toast: butter paper and the 750 ml kraft box. Meals and pasta: 650 ml leak-proof rectangular container with lid, dressing in a 50 ml cup, wooden spork. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Basil Pesto Paneer Sandwich",
   "data": {
    "veg": true,
    "category": "Sandwich / meal",
    "ingredients": [
     {
      "name": "Sourdough slice",
      "qty_s": "2 pc"
     },
     {
      "name": "Cream cheese",
      "qty_s": "30 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Basil pesto dressing",
      "qty_s": "20 g"
     },
     {
      "name": "Roasted tomatoes",
      "qty_s": "30 g"
     },
     {
      "name": "Baby spinach",
      "qty_s": "5 g"
     },
     {
      "name": "Bocconcini",
      "qty_s": "1 pc"
     },
     {
      "name": "Balsamic glaze",
      "qty_s": "5 g"
     }
    ],
    "plating": "Butter paper and the 750 ml kraft box. Sleeve and printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-81.jpg"
  },
  {
   "kind": "recipe",
   "title": "Calabrese Bocconcini Sandwich",
   "data": {
    "veg": true,
    "category": "Sandwich / meal",
    "ingredients": [
     {
      "name": "Sourdough slice",
      "qty_s": "2 pc"
     },
     {
      "name": "Cream cheese",
      "qty_s": "30 g"
     },
     {
      "name": "Baby spinach",
      "qty_s": "5 g"
     },
     {
      "name": "Basil pesto dressing",
      "qty_s": "30 g"
     },
     {
      "name": "Roasted tomatoes",
      "qty_s": "20 g"
     },
     {
      "name": "Roasted vegetable",
      "qty_s": "60 g"
     },
     {
      "name": "Bocconcini",
      "qty_s": "25 g"
     },
     {
      "name": "Balsamic glaze",
      "qty_s": "5 g"
     }
    ],
    "plating": "Butter paper and the 750 ml kraft box. Sleeve and printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-75.jpg"
  },
  {
   "kind": "recipe",
   "title": "BBQ Mushroom Sandwich",
   "data": {
    "veg": true,
    "category": "Sandwich / meal",
    "ingredients": [
     {
      "name": "Sourdough slice",
      "qty_s": "2 pc"
     },
     {
      "name": "Cream cheese",
      "qty_s": "30 g"
     },
     {
      "name": "Baby spinach",
      "qty_s": "5 g"
     },
     {
      "name": "Grilled mushroom",
      "qty_s": "60 g"
     },
     {
      "name": "BBQ sauce",
      "qty_s": "20 g"
     },
     {
      "name": "Caramelised onions",
      "qty_s": "20 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "10 g"
     }
    ],
    "plating": "Butter paper and the 750 ml kraft box. Sleeve and printed paper bag."
   },
   "media_url": "https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-78.jpg"
  },
  {
   "kind": "recipe",
   "title": "Pepper Paneer and Corn Sandwich",
   "data": {
    "veg": true,
    "category": "Sandwich / meal",
    "ingredients": [
     {
      "name": "Sourdough slice",
      "qty_s": "2 pc"
     },
     {
      "name": "Cream cheese",
      "qty_s": "30 g"
     },
     {
      "name": "Baby spinach",
      "qty_s": "5 g"
     },
     {
      "name": "Grilled paneer",
      "qty_s": "60 g"
     },
     {
      "name": "Boiled sweet corn",
      "qty_s": "20 g"
     },
     {
      "name": "Red bell pepper",
      "qty_s": "10 g"
     },
     {
      "name": "Onion",
      "qty_s": "10 g"
     },
     {
      "name": "Jalapeño, sliced",
      "qty_s": "10 g"
     },
     {
      "name": "Chipotle paste",
      "qty_s": "20 g"
     },
     {
      "name": "Mango chipotle dressing",
      "qty_s": "15 g"
     }
    ],
    "plating": "Butter paper and the 750 ml kraft box. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Avocado and Garlic Butter Rye Toast",
   "data": {
    "veg": true,
    "category": "Sandwich / meal",
    "ingredients": [
     {
      "name": "Sourdough slice",
      "qty_s": "1 pc"
     },
     {
      "name": "Garlic butter",
      "qty_s": "20 g"
     },
     {
      "name": "Avocado",
      "qty_s": "100 g"
     },
     {
      "name": "Red radish",
      "qty_s": "5 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g"
     }
    ],
    "plating": "Butter paper and the 750 ml kraft box. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Basil Pesto Paneer Meal",
   "data": {
    "veg": true,
    "category": "Sandwich / meal",
    "ingredients": [
     {
      "name": "Grilled paneer",
      "qty_s": "120 g"
     },
     {
      "name": "Basil pesto dressing",
      "qty_s": "30 g"
     },
     {
      "name": "Boiled couscous",
      "qty_s": "120 g"
     },
     {
      "name": "Blanched broccoli",
      "qty_s": "50 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g"
     },
     {
      "name": "Roasted garlic hummus",
      "qty_s": "160 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     }
    ],
    "plating": "650 ml leak-proof rectangular container with lid, dressing in a 50 ml cup, wooden spork. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Thai Peanut Tofu Meal",
   "data": {
    "veg": true,
    "category": "Sandwich / meal",
    "ingredients": [
     {
      "name": "Grilled tofu",
      "qty_s": "120 g"
     },
     {
      "name": "Nutty ginger dressing",
      "qty_s": "80 g"
     },
     {
      "name": "Boiled buckwheat noodles",
      "qty_s": "80 g"
     },
     {
      "name": "Carrot",
      "qty_s": "40 g"
     },
     {
      "name": "Red cabbage",
      "qty_s": "40 g"
     },
     {
      "name": "Blanched broccoli",
      "qty_s": "50 g"
     },
     {
      "name": "Roasted peanuts",
      "qty_s": "15 g"
     },
     {
      "name": "Mixed sesame seeds",
      "qty_s": "2 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     }
    ],
    "plating": "650 ml leak-proof rectangular container with lid, dressing in a 50 ml cup, wooden spork. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Whole Wheat Pasta Pesto",
   "data": {
    "veg": null,
    "category": "Sandwich / meal",
    "ingredients": [
     {
      "name": "Whole wheat fusilli",
      "qty_s": "40 g"
     },
     {
      "name": "Grilled paneer, tofu or chicken (as ordered)",
      "qty_s": "60 g"
     },
     {
      "name": "Blanched broccoli",
      "qty_s": "30 g"
     },
     {
      "name": "Roasted vegetable",
      "qty_s": "30 g"
     },
     {
      "name": "Roasted red bell pepper",
      "qty_s": "20 g"
     },
     {
      "name": "Grilled mushroom",
      "qty_s": "30 g"
     },
     {
      "name": "Black olives, sliced",
      "qty_s": "20 g"
     },
     {
      "name": "Cream sauce",
      "qty_s": "50 g"
     },
     {
      "name": "Parmesan cheese",
      "qty_s": "20 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     }
    ],
    "plating": "650 ml leak-proof rectangular container with lid, dressing in a 50 ml cup, wooden spork. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Whole Wheat Pasta Mama Rosa",
   "data": {
    "veg": null,
    "category": "Sandwich / meal",
    "ingredients": [
     {
      "name": "Whole wheat fusilli",
      "qty_s": "40 g"
     },
     {
      "name": "Grilled paneer, tofu or chicken (as ordered)",
      "qty_s": "60 g"
     },
     {
      "name": "Blanched broccoli",
      "qty_s": "30 g"
     },
     {
      "name": "Roasted vegetable",
      "qty_s": "30 g"
     },
     {
      "name": "Roasted red bell pepper",
      "qty_s": "20 g"
     },
     {
      "name": "Grilled mushroom",
      "qty_s": "30 g"
     },
     {
      "name": "Black olives, sliced",
      "qty_s": "20 g"
     },
     {
      "name": "Cream sauce",
      "qty_s": "50 g"
     },
     {
      "name": "Tomato sauce",
      "qty_s": "150 g"
     },
     {
      "name": "Parmesan cheese",
      "qty_s": "20 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     }
    ],
    "plating": "650 ml leak-proof rectangular container with lid, dressing in a 50 ml cup, wooden spork. Sleeve and printed paper bag."
   }
  },
  {
   "kind": "recipe",
   "title": "Chicken and Mushroom Stroganoff",
   "data": {
    "veg": false,
    "category": "Sandwich / meal",
    "ingredients": [
     {
      "name": "Smoked chicken",
      "qty_s": "60 g"
     },
     {
      "name": "Grilled chicken",
      "qty_s": "60 g"
     },
     {
      "name": "Cream sauce",
      "qty_s": "150 g"
     },
     {
      "name": "Boiled brown rice",
      "qty_s": "150 g"
     },
     {
      "name": "Grilled mushroom",
      "qty_s": "50 g"
     },
     {
      "name": "Microgreens",
      "qty_s": "5 g"
     },
     {
      "name": "Pickled cucumber",
      "qty_s": "20 g"
     }
    ],
    "plating": "650 ml leak-proof rectangular container with lid, dressing in a 50 ml cup, wooden spork. Sleeve and printed paper bag."
   }
  }
 ],
 "questions": [
  {
   "prompt": "How much basil pesto dressing goes into the Calabrese Bocconcini Sandwich?",
   "options": [
    "20 g",
    "30 g",
    "45 g",
    "50 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much grilled paneer goes into the Pepper Paneer and Corn Sandwich?",
   "options": [
    "60 g",
    "70 g",
    "90 g",
    "120 g"
   ],
   "correct": [
    0
   ]
  },
  {
   "prompt": "How much grilled paneer, tofu or chicken (as ordered) goes into the Whole Wheat Pasta Pesto?",
   "options": [
    "50 g",
    "60 g",
    "70 g",
    "90 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much avocado goes into the Avocado and Garlic Butter Rye Toast?",
   "options": [
    "100 g",
    "110 g",
    "120 g",
    "150 g"
   ],
   "correct": [
    0
   ]
  },
  {
   "prompt": "How much nutty ginger dressing goes into the Thai Peanut Tofu Meal?",
   "options": [
    "70 g",
    "80 g",
    "120 g",
    "160 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much jalapeño, sliced goes into the BBQ Mushroom Sandwich?",
   "options": [
    "5 g",
    "10 g",
    "15 g",
    "30 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "Which of these go into the BBQ Mushroom Sandwich?",
   "kind": "multi",
   "options": [
    "Grilled paneer, tofu or chicken (as ordered)",
    "Tomato sauce",
    "Jalapeño, sliced",
    "Grilled mushroom"
   ],
   "correct": [
    2,
    3
   ]
  },
  {
   "prompt": "Which of these go into the Calabrese Bocconcini Sandwich?",
   "kind": "multi",
   "options": [
    "Basil pesto dressing",
    "Nutty ginger dressing",
    "Roasted tomatoes",
    "Red radish"
   ],
   "correct": [
    0,
    2
   ]
  }
 ]
}$j$::jsonb, null);

select training.save_module_doc($j${
 "code": "assembly-breakfast",
 "title": "Assembly: smoothie bowls and parfaits",
 "summary": "Chef-approved assembly cards from Command: 7 dishes with grams for every ingredient.",
 "kind": "recipe",
 "source_url": "https://command.flaxfoods.in",
 "est_minutes": 19,
 "pass_mark": 70,
 "sort_order": 24,
 "lessons": [
  {
   "kind": "slide",
   "data": {
    "icon": "chef",
    "eyebrow": "SMOOTHIE BOWLS AND PARFAITS",
    "headline": "HOW WE ASSEMBLE",
    "body": "Clean and cold:\n\n- **Layer parfaits:** yoghurt, fruit, granola, then honey on top\n- **Smoothie bowls:** smoothie base first, then toppings in neat rows\n- **Granola goes on last** so it stays crunchy\n- **Weigh, don't guess.** The grams below are the chef-approved card in Command."
   }
  },
  {
   "kind": "slide",
   "data": {
    "icon": "package",
    "eyebrow": "PACKING",
    "headline": "PACK IT RIGHT",
    "body": "Parfaits: 160 ml parfait cup with lid, sticker and cup holder. Smoothie bowls: 300 ml container with the parfait sticker."
   }
  },
  {
   "kind": "recipe",
   "title": "Acai Smoothie Bowl",
   "data": {
    "veg": true,
    "category": "Breakfast",
    "ingredients": [
     {
      "name": "Blueberry compote",
      "qty_s": "60 g"
     },
     {
      "name": "Banana",
      "qty_s": "1 pc"
     },
     {
      "name": "Chia seeds",
      "qty_s": "2 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g"
     },
     {
      "name": "Granola",
      "qty_s": "30 g"
     }
    ],
    "plating": "300 ml container with the parfait sticker."
   }
  },
  {
   "kind": "recipe",
   "title": "Mocha Smoothie Bowl",
   "data": {
    "veg": true,
    "category": "Breakfast",
    "ingredients": [
     {
      "name": "Mocha smoothie",
      "qty_s": "1 portion"
     },
     {
      "name": "Banana",
      "qty_s": "1 pc"
     },
     {
      "name": "Granola",
      "qty_s": "30 g"
     },
     {
      "name": "Whole almonds",
      "qty_s": "15 g"
     },
     {
      "name": "Choco chips",
      "qty_s": "15 g"
     }
    ],
    "plating": "300 ml container with the parfait sticker."
   }
  },
  {
   "kind": "recipe",
   "title": "Granola Power Bowl",
   "data": {
    "veg": true,
    "category": "Breakfast",
    "ingredients": [
     {
      "name": "Greek yoghurt",
      "qty_s": "200 g"
     },
     {
      "name": "Banana",
      "qty_s": "1 pc"
     },
     {
      "name": "Orange",
      "qty_s": "20 g"
     },
     {
      "name": "Dragon fruit",
      "qty_s": "20 g"
     },
     {
      "name": "Granola",
      "qty_s": "30 g"
     },
     {
      "name": "Pomegranate",
      "qty_s": "30 g"
     },
     {
      "name": "Chia seeds",
      "qty_s": "2 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g"
     }
    ],
    "plating": "300 ml container with the parfait sticker."
   }
  },
  {
   "kind": "recipe",
   "title": "Green Protein Smoothie",
   "data": {
    "veg": true,
    "category": "Breakfast",
    "ingredients": [
     {
      "name": "Green smoothie",
      "qty_s": "1 portion"
     },
     {
      "name": "Lettuce mix",
      "qty_s": "40 g"
     },
     {
      "name": "Banana",
      "qty_s": "1 pc"
     },
     {
      "name": "Granola",
      "qty_s": "20 g"
     },
     {
      "name": "Almond milk",
      "qty_s": "120 ml"
     },
     {
      "name": "Avocado",
      "qty_s": "30 g"
     },
     {
      "name": "Chia seeds",
      "qty_s": "2 g"
     },
     {
      "name": "Flax seeds",
      "qty_s": "2 g"
     }
    ],
    "plating": "300 ml container with the parfait sticker."
   }
  },
  {
   "kind": "recipe",
   "title": "Blueberry Honey Parfait",
   "data": {
    "veg": true,
    "category": "Breakfast",
    "ingredients": [
     {
      "name": "Granola",
      "qty_s": "50 g"
     },
     {
      "name": "Greek yoghurt",
      "qty_s": "100 g"
     },
     {
      "name": "Honey",
      "qty_s": "10 g"
     },
     {
      "name": "Blueberry compote",
      "qty_s": "20 g"
     }
    ],
    "plating": "160 ml parfait cup with lid, sticker and cup holder."
   }
  },
  {
   "kind": "recipe",
   "title": "Chocolate Orange Parfait",
   "data": {
    "veg": true,
    "category": "Breakfast",
    "ingredients": [
     {
      "name": "Granola",
      "qty_s": "50 g"
     },
     {
      "name": "Greek yoghurt",
      "qty_s": "100 g"
     },
     {
      "name": "Honey",
      "qty_s": "10 g"
     },
     {
      "name": "Orange",
      "qty_s": "30 g"
     },
     {
      "name": "Choco chips",
      "qty_s": "15 g"
     }
    ],
    "plating": "160 ml parfait cup with lid, sticker and cup holder."
   }
  },
  {
   "kind": "recipe",
   "title": "Dragon Fruit Parfait",
   "data": {
    "veg": true,
    "category": "Breakfast",
    "ingredients": [
     {
      "name": "Granola",
      "qty_s": "50 g"
     },
     {
      "name": "Greek yoghurt",
      "qty_s": "100 g"
     },
     {
      "name": "Honey",
      "qty_s": "10 g"
     },
     {
      "name": "Dragon fruit",
      "qty_s": "50 g"
     }
    ],
    "plating": "160 ml parfait cup with lid, sticker and cup holder."
   }
  }
 ],
 "questions": [
  {
   "prompt": "How much granola goes into the Mocha Smoothie Bowl?",
   "options": [
    "20 g",
    "30 g",
    "40 g",
    "60 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much avocado goes into the Green Protein Smoothie?",
   "options": [
    "15 g",
    "30 g",
    "40 g",
    "45 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much Greek yoghurt goes into the Chocolate Orange Parfait?",
   "options": [
    "90 g",
    "100 g",
    "150 g",
    "200 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much granola goes into the Acai Smoothie Bowl?",
   "options": [
    "15 g",
    "30 g",
    "45 g",
    "50 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much granola goes into the Dragon Fruit Parfait?",
   "options": [
    "25 g",
    "50 g",
    "75 g",
    "100 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "How much Greek yoghurt goes into the Blueberry Honey Parfait?",
   "options": [
    "50 g",
    "100 g",
    "120 g",
    "150 g"
   ],
   "correct": [
    1
   ]
  },
  {
   "prompt": "Which of these go into the Dragon Fruit Parfait?",
   "kind": "multi",
   "options": [
    "Orange",
    "Greek yoghurt",
    "Choco chips",
    "Granola"
   ],
   "correct": [
    1,
    3
   ]
  },
  {
   "prompt": "Which of these go into the Blueberry Honey Parfait?",
   "kind": "multi",
   "options": [
    "Choco chips",
    "Green smoothie",
    "Granola",
    "Greek yoghurt"
   ],
   "correct": [
    2,
    3
   ]
  }
 ]
}$j$::jsonb, null);


insert into training.paths (name, description, roster_groups, outlet_ids, due_days, is_active)
select 'Outlet kitchen: recipe assembly',
       'Chef-approved assembly cards from Command for kitchen staff at the outlets.',
       array['kitchen'],
       array(select id from public.flax_outlets where id <> 'central_kitchen' order by id),
       21, true
where not exists (select 1 from training.paths where name = 'Outlet kitchen: recipe assembly');

insert into training.path_modules (path_id, module_id, position)
select p.id, m.id, m.sort_order - 19
from training.paths p, training.modules m
where p.name = 'Outlet kitchen: recipe assembly'
  and m.code in ('assembly-bowls', 'assembly-salads', 'assembly-wraps', 'assembly-sandwiches-meals', 'assembly-breakfast')
on conflict do nothing;

-- "Know our food": command's photos where command has one.
update training.lessons l set media_url = x.url
from training.modules m,
     (values ('Shawarma Paneer Bowl', 'https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-VSB09.jpg'),
             ('Mexican Bowl', 'https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-VSB10.jpg'),
             ('Mediterranean Bowl', 'https://iyoosjvqmtqtclswxgpd.supabase.co/storage/v1/object/public/cafe-menu/blr/pp-116.jpg')) x(title, url)
where m.code = 'food-signature-dishes' and l.module_id = m.id and l.kind = 'recipe' and l.title = x.title;

select training.sync_paths();
