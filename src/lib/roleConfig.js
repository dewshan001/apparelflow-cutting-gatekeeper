import { ROLES } from "./roles";

export const DEMO_PASSWORD = "Demo@12345";

export const ROLE_CONFIG = {
  [ROLES.CUTTING_SUPERVISOR]: {
    label: "Cutting Supervisor",
    description:
      "Creates cutting orders from recipes, sets batch quantities, logs fabric yards and tracks cutting progress.",
    restriction: "Cannot verify batches. Cannot access the Sewing Queue.",
    home: "/orders",
    nav: [{ href: "/orders", label: "Orders" }],
    accent: "border-t-slate-800",
    email: "supervisor@demo.com",
  },
  [ROLES.CUTTING_VERIFIER]: {
    label: "Cutting Verifier",
    description:
      "Isolated QC checkpoint. Counts physical parts per recipe, triggers traffic lights, approves or rejects batches.",
    restriction: "Cannot create cutting orders or edit recipes. Cannot access the Sewing Queue.",
    home: "/verification",
    nav: [{ href: "/verification", label: "Verification Terminal" }],
    accent: "border-t-green-700",
    email: "verifier@demo.com",
  },
  [ROLES.SEWING_SUPERVISOR]: {
    label: "Sewing Supervisor",
    description:
      "Receives verified batches on the assembly floor, reviews verifier audit notes and starts sewing.",
    restriction: "Blocked from seeing unverified, pending or rejected cutting orders.",
    home: "/sewing",
    nav: [{ href: "/sewing", label: "Sewing Queue" }],
    accent: "border-t-orange-600",
    email: "sewing@demo.com",
  },
};

export const DEMO_ACCOUNTS = Object.entries(ROLE_CONFIG).map(([role, c]) => ({
  role,
  label: c.label,
  email: c.email,
  password: DEMO_PASSWORD,
}));

export function homeFor(role) {
  return ROLE_CONFIG[role]?.home ?? "/login";
}
