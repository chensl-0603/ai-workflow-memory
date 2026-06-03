export function cleanActionText(value: string) {
  return value.trim().replace(/[\s,，。；;:：]+$/u, "");
}
