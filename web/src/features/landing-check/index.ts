import { Target } from "lucide-react";
import type { Block } from "@/ui";
import { LandingCheck } from "./LandingCheck";

export const landingCheck: Block = { id: "landing-check", title: "Landing accuracy check", icon: Target, span: "lg:col-span-12", Component: LandingCheck };
