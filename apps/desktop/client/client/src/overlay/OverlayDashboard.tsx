import React, { useEffect, useState } from "react";
import Apps from "@/components/dashboard/apps";
import Shortcuts from "@/components/dashboard/shortcuts";
import SoundPad from "@/components/dashboard/soundpad";
import ObsStudio from "@/components/dashboard/obs";
import WebDeckEditor from "@/components/dashboard/webdeck";
import WebPages from "@/components/dashboard/webpages";
import OverlayDeckView from "@/overlay/OverlayDeckView";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X,
  PanelsTopLeft,
  Layers2,
  Globe,
  Radio,
  LayoutTemplate,
  Music2,
  Pencil
} from 'lucide-react';
import { useNavigation } from "@/contexts/NavigationContext";
import { useI18n } from "@/contexts/I18nContext";

export default function OverlayDashboard() {
  const { t } = useI18n();
  const { get, set } = useNavigation();
  const [mainTab, setMainTab] = useState(() => get("overlayPages") || "webdeck");
  const [webdeckTab, setWebdeckTab] = useState(() => get("overlayWebdeckPages") || "deck");

  useEffect(() => {
    if (!get("overlayPages")) set("overlayPages", "webdeck");
    if (!get("overlayWebdeckPages")) set("overlayWebdeckPages", "deck");
  }, [get, set]);

  return (
    <div className="min-h-screen h-screen w-screen overflow-hidden flex flex-col bg-transparent">
      <div className="relative h-full w-full p-20 bg-transparent">
        <Button
          type="button"
          rounded="full"
          variant="ghost-destructive"
          className="absolute right-4 top-4 z-50 h-12 w-12 p-0"
          onClick={() => {
            void window.underdeck.overlay.closeWindow();
          }}
        >
          <X size={50} className="h-20 w-20" />
        </Button>

        <Card className="h-full w-full p-3 bg-black/30 backdrop-blur-lg border-white/20 shadow-2xl">
          <Tabs
            value={mainTab}
            onValueChange={(value) => {
              setMainTab(value);
              set("overlayPages", value);
              if (value === "webdeck") {
                set("overlayWebdeckPages", "deck");
                setWebdeckTab("deck");
              }
            }}
            className="h-full"
          >
            <TabsList className="w-full h-10 flex flex-wrap gap-1 p-1 rounded-xl">
              <TabsTrigger value="apps" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "apps" ? "primary" : "secondary"} className="w-full">
                  <PanelsTopLeft /> {t("sidebar.apps", "Aplicativos")}
                </Button>
              </TabsTrigger>
              <TabsTrigger value="webdeck" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "webdeck" ? "primary" : "secondary"} className="w-full">
                  <LayoutTemplate/> {t("sidebar.deck", "Deck")}
                </Button>
              </TabsTrigger>
              <TabsTrigger value="obs" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "obs" ? "primary" : "secondary"} className="w-full">
                  <Radio /> {t("sidebar.obsstudio", "Obs Studio")}
                </Button>
              </TabsTrigger>
              <TabsTrigger value="webpages" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "webpages" ? "primary" : "secondary"} className="w-full">
                  <Globe /> {t("sidebar.webpages", "Paginas Webs")}
                </Button>
              </TabsTrigger>
              <TabsTrigger value="shortcuts" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "shortcuts" ? "primary" : "secondary"} className="w-full">
                  <Layers2 /> {t("sidebar.shortcuts", "Teclas de Atalho")}
                </Button>
              </TabsTrigger>
              <TabsTrigger value="soundpad" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "soundpad" ? "primary" : "secondary"} className="w-full">
                  <Music2 /> {t("sidebar.soudpad", "Sound Pad")}
                </Button>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="webdeck" className="h-[calc(100%-56px)] min-h-0">
              <Tabs
                value={webdeckTab}
                onValueChange={(value) => {
                  setWebdeckTab(value);
                  set("overlayWebdeckPages", value);
                }}
                className="h-full"
              >
                <TabsList className="w-full grid gap-1 grid-cols-2 h-10 rounded-xl">
                  <TabsTrigger value="deck" className="rounded-xl" asChild unstyled>
                    <Button rounded="xl" variant={webdeckTab === "deck" ? "primary" : "secondary"} className="w-full">
                      <LayoutTemplate/> Deck
                    </Button>
                  </TabsTrigger>
                  <TabsTrigger value="editor" className="rounded-xl" asChild unstyled>
                    <Button rounded="xl" variant={webdeckTab === "editor" ? "primary" : "secondary"} className="w-full">
                      <Pencil/> Editor
                    </Button>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="deck" className="h-[calc(100%-44px)] min-h-0 overflow-hidden rounded-xl">
                  <OverlayDeckView />
                </TabsContent>

                <TabsContent value="editor" className="h-[calc(100%-44px)] min-h-0 overflow-y-auto">
                  <WebDeckEditor className="border-none" sourceId="OVERLAY" />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="apps" className="h-[calc(100%-56px)] min-h-0 overflow-y-auto">
              <Apps />
            </TabsContent>
            <TabsContent value="shortcuts" className="h-[calc(100%-56px)] min-h-0 overflow-y-auto">
              <Shortcuts />
            </TabsContent>
            <TabsContent value="soundpad" className="h-[calc(100%-56px)] min-h-0 overflow-y-auto">
              <SoundPad className="border-none" />
            </TabsContent>
            <TabsContent value="obs" className="h-[calc(100%-56px)] min-h-0 overflow-y-auto">
              <ObsStudio className="border-none" />
            </TabsContent>
            <TabsContent value="webpages" className="h-[calc(100%-56px)] min-h-0 overflow-y-auto">
              <WebPages />
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
