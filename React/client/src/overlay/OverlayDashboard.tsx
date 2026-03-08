import React, { useState } from "react";
import Apps from "@/components/dashboard/apps";
import Shortcuts from "@/components/dashboard/shortcuts";
import SoundPad from "@/components/dashboard/soundpad";
import ObsStudio from "@/components/dashboard/obs";
import WebDeckEditor from "@/components/dashboard/webdeck";
import OverlayDeckView from "@/overlay/OverlayDeckView";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X } from "lucide-react";

export default function OverlayDashboard() {
  const [mainTab, setMainTab] = useState("webdeck");
  const [webdeckTab, setWebdeckTab] = useState("deck");

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
          <Tabs value={mainTab} onValueChange={setMainTab} className="h-full">
            <TabsList className="w-full h-10 flex flex-wrap gap-1 p-1 rounded-xl">
              <TabsTrigger value="webdeck" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "webdeck" ? "primary" : "secondary"} className="w-full">
                  WebDeck
                </Button>
              </TabsTrigger>
              <TabsTrigger value="apps" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "apps" ? "primary" : "secondary"} className="w-full">
                  Apps
                </Button>
              </TabsTrigger>
              <TabsTrigger value="shortcuts" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "shortcuts" ? "primary" : "secondary"} className="w-full">
                  Teclas de Atalhos
                </Button>
              </TabsTrigger>
              <TabsTrigger value="soundpad" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "soundpad" ? "primary" : "secondary"} className="w-full">
                  SoundPad
                </Button>
              </TabsTrigger>
              <TabsTrigger value="obs" className="rounded-xl" asChild unstyled>
                <Button rounded="xl" variant={mainTab == "obs" ? "primary" : "secondary"} className="w-full">
                  OBS Studio
                </Button>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="webdeck" className="h-[calc(100%-56px)] min-h-0">
              <Tabs value={webdeckTab} onValueChange={setWebdeckTab} className="h-full">
                <TabsList className="w-full grid gap-1 grid-cols-2 h-10 rounded-xl">
                  <TabsTrigger value="deck" className="rounded-xl" asChild unstyled>
                    <Button rounded="xl" variant={webdeckTab === "deck" ? "primary" : "secondary"} className="w-full">
                      Deck
                    </Button>
                  </TabsTrigger>
                  <TabsTrigger value="editor" className="rounded-xl" asChild unstyled>
                    <Button rounded="xl" variant={webdeckTab === "editor" ? "primary" : "secondary"} className="w-full">
                      Editor
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
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
