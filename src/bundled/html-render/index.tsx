import type { PluginModule } from "../../plugins/api";
import { HtmlAttachment, isHtmlAttachment } from "./HtmlAttachment";
import { htmlRenderTool } from "./tool";

export const inject = ["conversation", "agents"];
export const apply: PluginModule["apply"] = (ctx) => {
  ctx.conversation.registerAttachment({
    id: "page",
    title: "HTML page",
    matches: isHtmlAttachment,
    component: HtmlAttachment,
  });
  ctx.agents.addTool(htmlRenderTool);
};
