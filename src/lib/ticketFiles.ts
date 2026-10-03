import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatEventDate, formatEventTime } from "./date";

export interface DownloadableTicket {
  id: string;
  publicCode: string;
  backupCode: string;
  eventTitle: string;
  when: string;
  where: string;
  orderReference: string;
  buyerEmail: string;
  buyerPhone: string;
}

interface TicketRowLike {
  id: string;
  public_code: string;
  backup_code: string;
  purchase?: { buyer_email: string | null; buyer_phone?: string | null; reference: string } | null;
  event?: { title: string; starts_at: string; venue?: { name: string; town: string } | null } | null;
}

export function toDownloadable(row: TicketRowLike): DownloadableTicket {
  const ev = row.event;
  return {
    id: row.id,
    publicCode: row.public_code,
    backupCode: row.backup_code,
    eventTitle: ev?.title ?? "Event ticket",
    when: ev ? `${formatEventDate(ev.starts_at)} · ${formatEventTime(ev.starts_at)}` : "",
    where: ev?.venue ? `${ev.venue.name}, ${ev.venue.town}` : "",
    orderReference: row.purchase?.reference ?? "",
    buyerEmail: row.purchase?.buyer_email ?? "",
    buyerPhone: row.purchase?.buyer_phone ?? "",
  };
}

/** Reads the tickets of one order (RLS limits this to the order's buyer). */
export async function fetchTicketsForOrder(db: SupabaseClient, orderId: string): Promise<DownloadableTicket[]> {
  const { data, error } = await db
    .from("tickets")
    .select(
      "id, public_code, backup_code, purchase:orders!tickets_order_id_fkey(buyer_email, buyer_phone, reference), event:events(title, starts_at, venue:venues(name, town))",
    )
    .eq("order_id", orderId)
    .order("issued_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as TicketRowLike[]).map(toDownloadable);
}

// ── Rendering ────────────────────────────────────────────────────────────
const CARD_W = 900;
const CARD_H = 380;
const PAD = 28;
const GAP = 24;
const QR_SIZE = 250;
const RIGHT_W = 330;
const FONT = `"Helvetica Neue", Helvetica, Arial, sans-serif`;
const MONO = `"Courier New", Courier, monospace`;
const C = { paper: "#f6efe3", card: "#fffdf8", ink: "#1f1a14", soft: "#6b6155", accent: "#d4972a", line: "#d9cdb8" };

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clip(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function fitLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(test).width <= maxWidth) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines) out[out.length - 1] = `${out[out.length - 1]}…`;
  return out.map((l) => clip(ctx, l, maxWidth));
}

async function qrImage(text: string): Promise<HTMLImageElement> {
  const url = await QRCode.toDataURL(text, { margin: 1, width: 500, errorCorrectionLevel: "M" });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not render the QR code"));
    img.src = url;
  });
}

/** +254748087457 -> +254748***457 (keeps the ticket useful without exposing the full number). */
function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) return `+${digits}`;
  return `+${digits.slice(0, 6)}***${digits.slice(-3)}`;
}

function drawTicket(ctx: CanvasRenderingContext2D, t: DownloadableTicket, x: number, y: number, qr: HTMLImageElement) {
  // Card
  ctx.save();
  roundedRect(ctx, x, y, CARD_W, CARD_H, 20);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.line;
  ctx.stroke();
  ctx.clip();
  ctx.fillStyle = C.accent;
  ctx.fillRect(x, y, CARD_W, 12);
  ctx.restore();

  const left = x + 36;
  const textW = CARD_W - RIGHT_W - 36 - 24;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = C.accent;
  ctx.font = `bold 16px ${FONT}`;
  ctx.fillText("AFRITICKET", left, y + 52);

  ctx.fillStyle = C.ink;
  ctx.font = `bold 32px ${FONT}`;
  let cy = y + 96;
  for (const line of fitLines(ctx, t.eventTitle || "Event ticket", textW, 2)) {
    ctx.fillText(line, left, cy);
    cy += 40;
  }
  cy += 4;

  ctx.fillStyle = C.soft;
  ctx.font = `20px ${FONT}`;
  if (t.when) {
    ctx.fillText(clip(ctx, t.when, textW), left, cy);
    cy += 30;
  }
  if (t.where) {
    ctx.fillText(clip(ctx, t.where, textW), left, cy);
  }

  // Backup code block
  ctx.fillStyle = C.soft;
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText("BACKUP CODE (if the QR won't scan)", left, y + CARD_H - 140);
  ctx.fillStyle = C.ink;
  ctx.font = `bold 30px ${MONO}`;
  ctx.fillText(clip(ctx, t.backupCode, textW), left, y + CARD_H - 104);

  ctx.fillStyle = C.soft;
  ctx.font = `14px ${FONT}`;
  const meta = [t.orderReference && `Order ${t.orderReference}`, t.buyerEmail].filter(Boolean).join(" · ");
  if (meta) ctx.fillText(clip(ctx, meta, textW), left, y + CARD_H - 76);
  if (t.buyerPhone) {
    ctx.fillText(clip(ctx, `Phone number: ${maskPhone(t.buyerPhone)}`, textW), left, y + CARD_H - 54);
  }
  ctx.font = `13px ${FONT}`;
  ctx.fillText(clip(ctx, "Show the QR code or backup code at the entrance. No login needed.", textW), left, y + CARD_H - 28);

  // Divider
  const dx = x + CARD_W - RIGHT_W;
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dx, y + 30);
  ctx.lineTo(dx, y + CARD_H - 30);
  ctx.stroke();
  ctx.restore();

  // QR
  const qx = dx + (RIGHT_W - QR_SIZE) / 2;
  const qy = y + 60;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qx - 8, qy - 8, QR_SIZE + 16, QR_SIZE + 16);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, qx, qy, QR_SIZE, QR_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = C.soft;
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("Scan at entry", qx + QR_SIZE / 2, qy + QR_SIZE + 36);
  ctx.textAlign = "left";
}

export async function renderTicketsPng(tickets: DownloadableTicket[]): Promise<Blob> {
  if (tickets.length === 0) throw new Error("No tickets to render");
  const width = CARD_W + PAD * 2;
  const height = PAD * 2 + tickets.length * CARD_H + (tickets.length - 1) * GAP;
  // Keep the canvas under ~12 megapixels so phones don't refuse to render it.
  const scale = Math.max(1, Math.min(2, Math.sqrt(12_000_000 / (width * height))));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.scale(scale, scale);
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, width, height);

  const qrs = await Promise.all(tickets.map((t) => qrImage(t.publicCode)));
  tickets.forEach((t, i) => drawTicket(ctx, t, PAD, PAD + i * (CARD_H + GAP), qrs[i]));

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the ticket image"))), "image/png"),
  );
}

/** Saves all given tickets as one PNG file. */
export async function downloadTicketsPng(tickets: DownloadableTicket[], fileBase: string): Promise<void> {
  const blob = await renderTicketsPng(tickets);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBase.replace(/[^a-z0-9._-]+/gi, "-")}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}