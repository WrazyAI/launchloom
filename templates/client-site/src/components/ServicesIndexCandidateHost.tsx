import SelectedServicesIndexPage from "../generated-experiences/selected/ServicesIndexPage.jsx";
import type { CreativeContent, CreativeRuntime } from "../lib/creative-runtime";

type Props = {
  content: CreativeContent;
  runtime: CreativeRuntime;
};

export default function ServicesIndexCandidateHost({ content, runtime }: Props) {
  return <SelectedServicesIndexPage content={content} runtime={runtime} />;
}
