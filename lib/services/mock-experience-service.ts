import "server-only";

import { getExperienceRepository } from "@/lib/repository/provider";
import { ExperienceService } from "./experience-service";

/** Shared stateful service for the explicit process-local Mock data provider. */
export const mockExperienceService = new ExperienceService(getExperienceRepository());
