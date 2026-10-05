// Demo users and the two production recipes. Shared by scripts/seed.js and the test suite
// so both always use exactly the same data.

export const DEMO_PASSWORD = "Demo@12345";

export const DEMO_USERS = [
  { email: "supervisor@demo.com", role: "cutting_supervisor", fullName: "Sam Supervisor" },
  { email: "verifier@demo.com", role: "cutting_verifier", fullName: "Vera Verifier" },
  { email: "sewing@demo.com", role: "sewing_supervisor", fullName: "Sewa Sewing" },
];

export const RECIPES = [
  {
    recipeCode: "REC-BL01",
    name: "Casual Blouse",
    category: "Blouse",
    stdFabricYards: "1.80",
    wastageCap: "5.00",
    components: [
      ["Front Body Panel", 1],
      ["Back Body Panel", 1],
      ["Sleeves (Left & Right)", 2],
      ["Collar & Stand", 1],
      ["Sleeve Cuffs", 2],
    ],
  },
  {
    recipeCode: "REC-CT02",
    name: "Crop Top",
    category: "Crop Top",
    stdFabricYards: "1.10",
    wastageCap: "8.00",
    components: [
      ["Front Chest Panel", 1],
      ["Back Support Panel", 1],
      ["Neck Binding Strip", 1],
      ["Hem Elastic Casing", 1],
      ["Side Strap Accents", 2],
    ],
  },
];
