from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one occurrence, found {count}")
    return text.replace(old, new, 1)

admin_path = Path("src/routes/admin.tsx")
admin = admin_path.read_text(encoding="utf-8")
admin = replace_once(
    admin,
    '.select("*, support_messages(id,sender_user_id,message,is_internal,created_at)")',
    '.select("*, support_messages(id,sender_user_id,message,attachment_paths,is_internal,created_at)")',
    "admin support attachment query",
)
admin_path.write_text(admin, encoding="utf-8")

panel_path = Path("src/components/AdminSupportPanel.tsx")
panel = panel_path.read_text(encoding="utf-8")
panel = replace_once(
    panel,
    'import { Loader2, LockKeyhole, MessageSquareReply } from "lucide-react";\nimport { Button } from "@/components/ui/button";',
    'import { FileText, Loader2, LockKeyhole, MessageSquareReply } from "lucide-react";\nimport { Button } from "@/components/ui/button";\nimport { supabase } from "@/integrations/supabase/client";\nimport { toast } from "sonner";',
    "admin support imports",
)
panel = replace_once(
    panel,
    '''const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";''',
    '''const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

const openSupportAttachment = async (path: string) => {
  const { data, error } = await supabase.storage
    .from("support-attachments")
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    toast.error("Não foi possível abrir este anexo.");
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = data.signedUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
};''',
    "admin support open helper",
)
panel = replace_once(
    panel,
    '''                  {messages.map((message: any) => {
                    const fromRequester = message.sender_user_id === ticket.requester_user_id;
                    return (''',
    '''                  {messages.map((message: any) => {
                    const fromRequester = message.sender_user_id === ticket.requester_user_id;
                    const attachmentPaths = Array.isArray(message.attachment_paths)
                      ? message.attachment_paths
                      : [];
                    return (''',
    "admin support paths",
)
panel = replace_once(
    panel,
    '''                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                          {message.message}
                        </p>''',
    '''                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                          {message.message}
                        </p>
                        {attachmentPaths.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {attachmentPaths.map((path: string, index: number) => (
                              <button
                                key={path}
                                type="button"
                                onClick={() => void openSupportAttachment(path)}
                                className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-[11px] font-bold text-zinc-300"
                              >
                                <FileText className="h-3.5 w-3.5 text-primary" />
                                Anexo {index + 1}
                              </button>
                            ))}
                          </div>
                        ) : null}''',
    "admin support attachment render",
)
panel_path.write_text(panel, encoding="utf-8")
