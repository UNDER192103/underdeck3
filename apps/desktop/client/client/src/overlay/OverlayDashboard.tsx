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
              <TabsTrigger value="apps">
                <PanelsTopLeft /> {t("sidebar.apps", "Aplicativos")}
              </TabsTrigger>
              <TabsTrigger value="webdeck">
                <LayoutTemplate /> {t("sidebar.deck", "Deck")}
              </TabsTrigger>
              <TabsTrigger value="obs">
                <Radio /> {t("sidebar.obsstudio", "Obs Studio")}
              </TabsTrigger>
              <TabsTrigger value="webpages">
                <Globe /> {t("sidebar.webpages", "Paginas Webs")}
              </TabsTrigger>
              <TabsTrigger value="shortcuts">
                <Layers2 /> {t("sidebar.shortcuts", "Teclas de Atalho")}
              </TabsTrigger>
              <TabsTrigger value="soundpad">
                <Music2 /> {t("sidebar.soudpad", "Sound Pad")}
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
                  <TabsTrigger value="deck">
                    <LayoutTemplate /> Deck
                  </TabsTrigger>
                  <TabsTrigger value="editor">
                    <Pencil /> Editor
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
