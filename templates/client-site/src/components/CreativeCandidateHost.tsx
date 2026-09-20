import { useEffect } from "react";
import SelectedExperience from "../generated-experiences/selected/Experience.jsx";
import { mountExperienceMotion } from "../generated-experiences/selected/motion.js";
import type { CreativeContent, CreativeRuntime } from "../lib/creative-runtime";

type Props = {
  content: CreativeContent;
  runtime: CreativeRuntime;
};

export default function CreativeCandidateHost({ content, runtime }: Props) {
  useEffect(() => {
    const cleanup = mountExperienceMotion(runtime);
    return typeof cleanup === "function" ? cleanup : undefined;
  }, [runtime]);

  return <SelectedExperience content={content} runtime={runtime} />;
}
