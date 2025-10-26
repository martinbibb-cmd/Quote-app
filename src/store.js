export const initial = {
  forest: [
    {
      "id":"current_boiler",
      "title":"Current boiler (A pack)",
      "meta":"",
      "chips":[],
      "children":[
        {"id":"current_regular","title":"Regular (1)","meta":"","children":[]},
        {"id":"current_system","title":"System (2)","meta":"","children":[]},
        {"id":"current_combi","title":"Combi (3)","meta":"","children":[]},
        {"id":"current_warm_air","title":"Warm air (4)","meta":"","children":[]},
        {"id":"current_none","title":"None (5)","meta":"","children":[]}
      ]
    },
    {
      "id":"flue_a",
      "title":"Flue (a)",
      "meta":"",
      "chips":[],
      "children":[
        {"id":"flue_horizontal","title":"Horizontal (1)","meta":"","children":[]},
        {"id":"flue_direct_rear","title":"Direct rear (2)","meta":"","children":[]},
        {"id":"flue_balanced","title":"Balanced (3)","meta":"","children":[]},
        {
          "id":"flue_vertical",
          "title":"Vertical (4)",
          "meta":"",
          "children":[
            {"id":"flue_vertical_pitched","title":"Pitched roof (1)","meta":"","children":[]},
            {"id":"flue_vertical_flat","title":"Flat roof (2)","meta":"","children":[]}
          ]
        }
      ]
    },
    {
      "id":"new_boiler",
      "title":"New boiler (B pack)",
      "meta":"",
      "chips":[],
      "children":[
        {"id":"new_regular","title":"Regular (1)","meta":"","children":[]},
        {"id":"new_system","title":"System (2)","meta":"","children":[]},
        {"id":"new_combi","title":"Combi (3)","meta":"","children":[]}
      ]
    },
    {
      "id":"new_flue_b",
      "title":"New flue (b)",
      "meta":"",
      "chips":[],
      "children":[
        {
          "id":"new_flue_turret",
          "title":"Turret (1)",
          "meta":"",
          "children":[
            {"id":"turret_right_a","title":"Right (a)","meta":"","children":[]},
            {"id":"turret_left_b","title":"Left (b)","meta":"","children":[]},
            {"id":"turret_rear_c","title":"Rear (c)","meta":"","children":[]}
          ]
        },
        {"id":"new_flue_rear","title":"Rear (2)","meta":"","children":[]},
        {
          "id":"new_flue_vertical",
          "title":"Vertical (3)",
          "meta":"",
          "children":[
            {"id":"vertical_len_plus_45_a","title":"Length plus 45 (a)","meta":"","children":[]},
            {"id":"vertical_lens_plus_90s_b","title":"Lengths plus 90s (b)","meta":"","children":[]}
          ]
        },
        {
          "id":"new_flue_extended",
          "title":"Extended (4)",
          "meta":"",
          "children":[
            {"id":"extended_define","title":"Define","meta":"","children":[]}
          ]
        }
      ]
    },
    {
      "id":"terminal",
      "title":"Terminal",
      "meta":"",
      "chips":[],
      "children":[
        {"id":"terminal_standard_wall_1","title":"Standard - wall 1","meta":"","children":[]},
        {"id":"terminal_plume_kit_2","title":"Plume kit 2","meta":"","children":[]},
        {"id":"terminal_vertical_flat_3","title":"Vertical flat 3","meta":"","children":[]},
        {"id":"terminal_vertical_flat_4","title":"Vertical flat 4","meta":"","children":[]}
      ]
    }
  ]
};
