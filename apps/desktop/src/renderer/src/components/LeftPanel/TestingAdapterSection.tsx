import type { PluginSource } from "@renderer/store/config.store";

function SidebarHeading({ title, description }: { title: string; description?: string }): React.JSX.Element {
  return (
    <div className="operator-sidebar-heading">
      <p className="operator-section-title">{title}</p>
      {description && <p>{description}</p>}
    </div>
  );
}

function shortPluginName(name: string): string {
  return name.replace(/^@[^/]+\//, "");
}

type TestingAdapterSectionProps = {
  isReady: boolean;
  isApplyingPlugin: boolean;
  pluginInfo: PluginInfo | null;
  pendingPlugin: PluginSource | null;
  onOpenPluginPicker: () => void;
};

export function TestingAdapterSection({
  isReady,
  isApplyingPlugin,
  pluginInfo,
  pendingPlugin,
  onOpenPluginPicker,
}: TestingAdapterSectionProps): React.JSX.Element {
  return (
    <section className="operator-sidebar-section">
      <div className="flex items-center justify-between gap-3">
        <SidebarHeading
          title="Testaanpak"
          description="Bepaalt hoe Specwright tests in dit project opslaat."
        />
        {isReady && (
          <button
            onClick={onOpenPluginPicker}
            disabled={isApplyingPlugin}
            className="operator-button-quiet px-2 py-1 disabled:opacity-40"
          >
            Wijzigen
          </button>
        )}
      </div>

      {isReady ? (
        <div className="min-w-0">
          {isApplyingPlugin ? (
            <p className="operator-text-subtle flex items-center gap-1 mt-1">
              <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-brand-400 border-t-transparent" />
              Installeren...
            </p>
          ) : pluginInfo && pluginInfo.name !== "none" ? (
            <div className="mt-1 min-w-0">
              <p
                className="operator-text truncate"
                title={`${pluginInfo.name}${pluginInfo.version && pluginInfo.version !== "unknown" ? ` v${pluginInfo.version}` : ""}`}
              >
                {shortPluginName(pluginInfo.name)}
                {pluginInfo.version && pluginInfo.version !== "unknown" && (
                  <span className="operator-text-subtle ml-1">v{pluginInfo.version}</span>
                )}
              </p>
              {pluginInfo.hasOverlay && pluginInfo.overlayName && (
                <p
                  className="operator-text-accent font-mono truncate flex items-center gap-1 mt-1"
                  title={pluginInfo.overlayName}
                >
                  <span className="text-stone-500">↳</span>
                  {shortPluginName(pluginInfo.overlayName)}
                </p>
              )}
            </div>
          ) : (
            <p className="operator-text-subtle mt-1">Standaard testaanpak actief</p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {pendingPlugin ? (
              <p
                className="operator-text-accent font-mono truncate mt-1"
                title={pendingPlugin.type === "local" ? pendingPlugin.dirPath : pendingPlugin.packageName}
              >
                {pendingPlugin.type === "local"
                  ? pendingPlugin.dirPath.split("/").pop()
                  : shortPluginName(pendingPlugin.packageName)}
              </p>
            ) : (
              <p className="operator-text-subtle mt-1">Choose a plugin before bootstrap</p>
            )}
          </div>
          <button
            onClick={onOpenPluginPicker}
            className="text-stone-500 hover:text-brand-400 text-xs transition-colors flex-shrink-0"
          >
            Change plugin
          </button>
        </div>
      )}
    </section>
  );
}
