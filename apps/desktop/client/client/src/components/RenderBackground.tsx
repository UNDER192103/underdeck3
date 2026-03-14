import { Theme, useTheme } from "@/contexts/ThemeContext";
import { BackgroundComp } from "@/components/ui/background";

export default function RenderBackground() {
  const { background } = useTheme();
  if (background) {
    return <BackgroundComp {...background} />;
  }
  return "";
}
