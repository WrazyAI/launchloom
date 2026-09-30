import SelectedLocationPage from "../generated-experiences/selected/LocationPage.jsx";
import type {
  CreativeContent,
  CreativeLocationPage,
  CreativeRuntime,
} from "../lib/creative-runtime";

type Props = {
  content: CreativeContent;
  runtime: CreativeRuntime;
  location: CreativeLocationPage;
};

export default function LocationCandidateHost({ content, runtime, location }: Props) {
  return <SelectedLocationPage content={content} runtime={runtime} location={location} />;
}
