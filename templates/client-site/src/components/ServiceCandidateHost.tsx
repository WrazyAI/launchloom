import SelectedServicePage from "../generated-experiences/selected/ServicePage.jsx";
import type {
  CreativeContent,
  CreativeRuntime,
  CreativeServicePage,
} from "../lib/creative-runtime";

type Props = {
  content: CreativeContent;
  runtime: CreativeRuntime;
  service: CreativeServicePage;
};

export default function ServiceCandidateHost({ content, runtime, service }: Props) {
  return <SelectedServicePage content={content} runtime={runtime} service={service} />;
}
