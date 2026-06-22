#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  finance.qyzar.eu — Interactive Setup Wizard
#  Run from the project root:  bash setup.sh
#  Windows users: requires Git Bash (ships with Git for Windows)
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

# ─── Colors ────────────────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'
M='\033[0;35m'; C='\033[0;36m'; W='\033[1;37m'; D='\033[2m'; NC='\033[0m'

# ─── UI Helpers ────────────────────────────────────────────────────────────────
section() {
  local title="  $*"
  echo
  printf "${C}╔%0.s═${NC}" {1..56}; echo -e "${C}╗${NC}"
  printf "${C}║${NC}${W}%-56s${NC}${C}║${NC}\n" "$title"
  printf "${C}╚%0.s═${NC}" {1..56}; echo -e "${C}╝${NC}"
  echo
}

ok()   { echo -e "  ${G}✔${NC}  $*"; }
fail() { echo -e "  ${R}✖${NC}  $*"; }
warn() { echo -e "  ${Y}⚠${NC}  $*"; }
info() { echo -e "  ${B}›${NC}  $*"; }
link() { echo -e "      ${M}↳  $*${NC}"; }
dim()  { echo -e "  ${D}$*${NC}"; }

# Visible input
ask() {
  local _r=$1 _p=$2 _d=${3-}
  [[ -n "$_d" ]] && printf "\n  ${Y}%s${NC} ${D}[%s]${NC}: " "$_p" "$_d" \
                 || printf "\n  ${Y}%s${NC}: " "$_p"
  local _v; read -r _v
  [[ -z "$_v" && -n "$_d" ]] && _v="$_d"
  printf -v "$_r" '%s' "$_v"
}

# Hidden input (API keys)
ask_secret() {
  local _r=$1 _p=$2
  printf "\n  ${Y}%s${NC} ${D}(hidden)${NC}: " "$_p"
  local _v; read -rs _v; echo
  printf -v "$_r" '%s' "$_v"
}

# Optional visible (Enter to skip)
ask_opt() {
  local _r=$1 _p=$2 _d=${3-}
  [[ -n "$_d" ]] && printf "\n  ${Y}%s${NC} ${D}[%s  |  Enter=skip]${NC}: " "$_p" "$_d" \
                 || printf "\n  ${Y}%s${NC} ${D}[Enter=skip]${NC}: " "$_p"
  local _v; read -r _v
  [[ -z "$_v" && -n "$_d" ]] && _v="$_d"
  printf -v "$_r" '%s' "$_v"
}

# Optional hidden (API keys, Enter to skip)
ask_opt_secret() {
  local _r=$1 _p=$2
  printf "\n  ${Y}%s${NC} ${D}(hidden  |  Enter=skip)${NC}: " "$_p"
  local _v; read -rs _v; echo
  printf -v "$_r" '%s' "$_v"
}

# Yes/no — returns 0=yes 1=no
ask_yn() {
  local _p=$1 _d=${2-y}
  printf "\n  ${Y}%s${NC} ${D}[%s/n]${NC}: " "$_p" "$_d"
  local _v; read -r _v
  [[ -z "$_v" ]] && _v="$_d"
  [[ "$_v" =~ ^[Yy] ]]
}

# Numbered model picker — uses $AI_CHOICE to show provider-specific list
# Usage: pick_model VARNAME "Prompt label"
pick_model() {
  local _r="$1" _label="$2"
  echo -e "\n  ${Y}${_label}${NC}"
  echo

  case "$AI_CHOICE" in
    1)  # OpenAI
      echo -e "  ${C}1)${NC}  ${W}gpt-4o${NC}          ${D}best balance — recommended for most agents${NC}"
      echo -e "  ${C}2)${NC}  ${W}gpt-4.1${NC}         ${D}latest GPT-4 generation${NC}"
      echo -e "  ${C}3)${NC}  ${W}o3${NC}               ${D}most powerful reasoning model${NC}"
      echo -e "  ${C}4)${NC}  ${W}gpt-4o-mini${NC}     ${D}fast and cheap — good for risk/monitoring agents${NC}"
      echo -e "  ${C}5)${NC}  ${W}o4-mini${NC}          ${D}fast reasoning${NC}"
      echo -e "  ${C}6)${NC}  ${W}gpt-3.5-turbo${NC}   ${D}legacy, very cheap${NC}"
      echo -e "  ${C}7)${NC}  Enter custom model name"
      local _c
      while true; do
        printf "\n  ${Y}Choice${NC} ${D}[1-7]${NC}: "; read -r _c
        case "$_c" in
          1) printf -v "$_r" '%s' "gpt-4o"; return ;;
          2) printf -v "$_r" '%s' "gpt-4.1"; return ;;
          3) printf -v "$_r" '%s' "o3"; return ;;
          4) printf -v "$_r" '%s' "gpt-4o-mini"; return ;;
          5) printf -v "$_r" '%s' "o4-mini"; return ;;
          6) printf -v "$_r" '%s' "gpt-3.5-turbo"; return ;;
          7) ask "$_r" "Custom model name"; return ;;
          *) warn "Enter 1-7." ;;
        esac
      done
      ;;
    2)  # Anthropic
      echo -e "  ${C}1)${NC}  ${W}claude-opus-4-5${NC}    ${D}most powerful — recommended for discovery/synthesis${NC}"
      echo -e "  ${C}2)${NC}  ${W}claude-sonnet-4-5${NC}  ${D}best balance of speed and intelligence${NC}"
      echo -e "  ${C}3)${NC}  ${W}claude-haiku-4-5${NC}   ${D}fast and cheap — good for risk/monitoring agents${NC}"
      echo -e "  ${C}4)${NC}  ${W}claude-opus-4${NC}      ${D}previous Opus generation${NC}"
      echo -e "  ${C}5)${NC}  ${W}claude-sonnet-4${NC}    ${D}previous Sonnet generation${NC}"
      echo -e "  ${C}6)${NC}  Enter custom model name"
      local _c
      while true; do
        printf "\n  ${Y}Choice${NC} ${D}[1-6]${NC}: "; read -r _c
        case "$_c" in
          1) printf -v "$_r" '%s' "claude-opus-4-5"; return ;;
          2) printf -v "$_r" '%s' "claude-sonnet-4-5"; return ;;
          3) printf -v "$_r" '%s' "claude-haiku-4-5"; return ;;
          4) printf -v "$_r" '%s' "claude-opus-4-20241022"; return ;;
          5) printf -v "$_r" '%s' "claude-sonnet-4-20241022"; return ;;
          6) ask "$_r" "Custom model name"; return ;;
          *) warn "Enter 1-6." ;;
        esac
      done
      ;;
    3)  # Groq
      echo -e "  ${C}1)${NC}  ${W}llama-3.3-70b-versatile${NC}   ${D}best Llama on Groq — recommended${NC}"
      echo -e "  ${C}2)${NC}  ${W}llama-3.1-70b-versatile${NC}   ${D}previous Llama 70B${NC}"
      echo -e "  ${C}3)${NC}  ${W}llama-3.1-8b-instant${NC}      ${D}ultra-fast, very cheap — good for risk agents${NC}"
      echo -e "  ${C}4)${NC}  ${W}mixtral-8x7b-32768${NC}        ${D}Mixtral MoE — long context${NC}"
      echo -e "  ${C}5)${NC}  ${W}gemma2-9b-it${NC}              ${D}Google Gemma 2 — fast${NC}"
      echo -e "  ${C}6)${NC}  ${W}deepseek-r1-distill-llama-70b${NC}  ${D}DeepSeek reasoning${NC}"
      echo -e "  ${C}7)${NC}  Enter custom model name"
      local _c
      while true; do
        printf "\n  ${Y}Choice${NC} ${D}[1-7]${NC}: "; read -r _c
        case "$_c" in
          1) printf -v "$_r" '%s' "llama-3.3-70b-versatile"; return ;;
          2) printf -v "$_r" '%s' "llama-3.1-70b-versatile"; return ;;
          3) printf -v "$_r" '%s' "llama-3.1-8b-instant"; return ;;
          4) printf -v "$_r" '%s' "mixtral-8x7b-32768"; return ;;
          5) printf -v "$_r" '%s' "gemma2-9b-it"; return ;;
          6) printf -v "$_r" '%s' "deepseek-r1-distill-llama-70b"; return ;;
          7) ask "$_r" "Custom model name"; return ;;
          *) warn "Enter 1-7." ;;
        esac
      done
      ;;
    4)  # Ollama
      echo -e "  ${C}1)${NC}  ${W}llama3.2${NC}     ${D}Meta Llama 3.2 — recommended default${NC}"
      echo -e "  ${C}2)${NC}  ${W}llama3.1${NC}     ${D}Meta Llama 3.1${NC}"
      echo -e "  ${C}3)${NC}  ${W}mistral${NC}      ${D}Mistral 7B${NC}"
      echo -e "  ${C}4)${NC}  ${W}gemma3${NC}       ${D}Google Gemma 3${NC}"
      echo -e "  ${C}5)${NC}  ${W}qwen2.5${NC}      ${D}Alibaba Qwen 2.5${NC}"
      echo -e "  ${C}6)${NC}  ${W}phi4${NC}         ${D}Microsoft Phi-4 — small & capable${NC}"
      echo -e "  ${C}7)${NC}  Enter custom model name  ${D}(any model you have pulled in Ollama)${NC}"
      local _c
      while true; do
        printf "\n  ${Y}Choice${NC} ${D}[1-7]${NC}: "; read -r _c
        case "$_c" in
          1) printf -v "$_r" '%s' "llama3.2"; return ;;
          2) printf -v "$_r" '%s' "llama3.1"; return ;;
          3) printf -v "$_r" '%s' "mistral"; return ;;
          4) printf -v "$_r" '%s' "gemma3"; return ;;
          5) printf -v "$_r" '%s' "qwen2.5"; return ;;
          6) printf -v "$_r" '%s' "phi4"; return ;;
          7) ask "$_r" "Custom model name"; return ;;
          *) warn "Enter 1-7." ;;
        esac
      done
      ;;
    5)  # Custom endpoint
      ask "$_r" "Model name" "gpt-4o"
      ;;
    *)  # Skipped (deepai.ts already existed)
      ask "$_r" "Model name" "gpt-4o"
      ;;
  esac
}

# Spinner
_SPIN_PID=""
spin_start() {
  (
    local s="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏" i=0
    while true; do
      printf "\r  ${C}${s:$((i%10)):1}${NC}  $1   "; sleep 0.08; ((i++)) || true
    done
  ) &
  _SPIN_PID=$!
}
spin_stop() {
  [[ -n "$_SPIN_PID" ]] && { kill "$_SPIN_PID" 2>/dev/null; wait "$_SPIN_PID" 2>/dev/null || true; }
  _SPIN_PID=""; printf "\r%-70s\r" " "
}

# Check result table
_CNAMES=(); _CSTATUS=()
chk() { _CNAMES+=("$1"); _CSTATUS+=("$2"); }  # chk "label" "pass|fail|warn|skip"

# ─── deepai.ts Templates ───────────────────────────────────────────────────────

write_openai_ts() {
cat > "backend/src/providers/ai/deepai.ts" << 'OPENAI_END'
// Generated by setup.sh — provider: OpenAI
// Requires:  npm install openai
import OpenAI from "openai";

export type MessageRole = "user" | "assistant" | "system";

export interface TextContentBlock { type: "text"; text: string; }
export interface ImageContentBlock {
    type: "image";
    source: { data: string; media_type?: string; };
}
export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface DeepAIMessage {
    role: MessageRole;
    content: string | ContentBlock[];
}
export interface DeepAICallOptions {
    model: string;
    system?: string;
    messages: DeepAIMessage[];
}
export interface DeepAIStreamOptions extends DeepAICallOptions {
    onChunk?: (chunk: string) => void;
}
export interface DeepAIStreamResult { ok: boolean; text: string; }

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildMessages(
    options: DeepAICallOptions,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (options.system) msgs.push({ role: "system", content: options.system });
    for (const m of options.messages) {
        if (typeof m.content === "string") {
            msgs.push({ role: m.role as "user" | "assistant", content: m.content });
        } else {
            msgs.push({
                role: m.role as "user" | "assistant",
                content: m.content.map(b =>
                    b.type === "text"
                        ? { type: "text" as const, text: b.text }
                        : {
                            type: "image_url" as const,
                            image_url: {
                                url: `data:${b.source.media_type ?? "image/png"};base64,${b.source.data}`,
                            },
                          }
                ),
            });
        }
    }
    return msgs;
}

export async function callDeepAI(options: DeepAICallOptions): Promise<string> {
    const res = await client.chat.completions.create({
        model: options.model,
        messages: buildMessages(options),
    });
    return res.choices[0]?.message?.content ?? "";
}

export async function streamDeepAI(options: DeepAIStreamOptions): Promise<DeepAIStreamResult> {
    try {
        if (!options.onChunk) {
            return { ok: true, text: await callDeepAI(options) };
        }
        const stream = await client.chat.completions.create({
            model: options.model,
            messages: buildMessages(options),
            stream: true,
        });
        let full = "";
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) { options.onChunk(delta); full += delta; }
        }
        return { ok: true, text: full };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, text: `OpenAI error: ${msg}` };
    }
}
OPENAI_END
}

write_anthropic_ts() {
cat > "backend/src/providers/ai/deepai.ts" << 'ANTHROPIC_END'
// Generated by setup.sh — provider: Anthropic
// Requires:  npm install @anthropic-ai/sdk
import Anthropic from "@anthropic-ai/sdk";

export type MessageRole = "user" | "assistant" | "system";

export interface TextContentBlock { type: "text"; text: string; }
export interface ImageContentBlock {
    type: "image";
    source: { data: string; media_type?: string; };
}
export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface DeepAIMessage {
    role: MessageRole;
    content: string | ContentBlock[];
}
export interface DeepAICallOptions {
    model: string;
    system?: string;
    messages: DeepAIMessage[];
}
export interface DeepAIStreamOptions extends DeepAICallOptions {
    onChunk?: (chunk: string) => void;
}
export interface DeepAIStreamResult { ok: boolean; text: string; }

type AnthropicMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toContent(content: string | ContentBlock[]): string | Anthropic.ContentBlockParam[] {
    if (typeof content === "string") return content;
    return content.map(b =>
        b.type === "text"
            ? ({ type: "text", text: b.text } as Anthropic.TextBlockParam)
            : ({
                type: "image",
                source: {
                    type: "base64",
                    media_type: (b.source.media_type ?? "image/png") as AnthropicMedia,
                    data: b.source.data,
                },
              } as Anthropic.ImageBlockParam)
    );
}

function buildMessages(options: DeepAICallOptions): Anthropic.MessageParam[] {
    return options.messages
        .filter(m => m.role !== "system")
        .map(m => ({
            role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
            content: toContent(m.content),
        }));
}

export async function callDeepAI(options: DeepAICallOptions): Promise<string> {
    const res = await client.messages.create({
        model: options.model,
        max_tokens: 8192,
        ...(options.system ? { system: options.system } : {}),
        messages: buildMessages(options),
    });
    const block = res.content[0];
    return block?.type === "text" ? block.text : "";
}

export async function streamDeepAI(options: DeepAIStreamOptions): Promise<DeepAIStreamResult> {
    try {
        if (!options.onChunk) {
            return { ok: true, text: await callDeepAI(options) };
        }
        const stream = client.messages.stream({
            model: options.model,
            max_tokens: 8192,
            ...(options.system ? { system: options.system } : {}),
            messages: buildMessages(options),
        });
        let full = "";
        for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                options.onChunk(event.delta.text);
                full += event.delta.text;
            }
        }
        return { ok: true, text: full };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, text: `Anthropic error: ${msg}` };
    }
}
ANTHROPIC_END
}

write_groq_ts() {
cat > "backend/src/providers/ai/deepai.ts" << 'GROQ_END'
// Generated by setup.sh — provider: Groq
// Requires:  npm install groq-sdk
import Groq from "groq-sdk";

export type MessageRole = "user" | "assistant" | "system";

export interface TextContentBlock { type: "text"; text: string; }
export interface ImageContentBlock {
    type: "image";
    source: { data: string; media_type?: string; };
}
export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface DeepAIMessage {
    role: MessageRole;
    content: string | ContentBlock[];
}
export interface DeepAICallOptions {
    model: string;
    system?: string;
    messages: DeepAIMessage[];
}
export interface DeepAIStreamOptions extends DeepAICallOptions {
    onChunk?: (chunk: string) => void;
}
export interface DeepAIStreamResult { ok: boolean; text: string; }

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

function toText(content: string | ContentBlock[]): string {
    if (typeof content === "string") return content;
    return content.filter(b => b.type === "text").map(b => (b as TextContentBlock).text).join("\n");
}

function buildMessages(
    options: DeepAICallOptions,
): Groq.Chat.Completions.ChatCompletionMessageParam[] {
    const msgs: Groq.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (options.system) msgs.push({ role: "system", content: options.system });
    for (const m of options.messages) {
        msgs.push({ role: m.role as "user" | "assistant", content: toText(m.content) });
    }
    return msgs;
}

export async function callDeepAI(options: DeepAICallOptions): Promise<string> {
    const res = await client.chat.completions.create({
        model: options.model,
        messages: buildMessages(options),
    });
    return res.choices[0]?.message?.content ?? "";
}

export async function streamDeepAI(options: DeepAIStreamOptions): Promise<DeepAIStreamResult> {
    try {
        if (!options.onChunk) {
            return { ok: true, text: await callDeepAI(options) };
        }
        const stream = await client.chat.completions.create({
            model: options.model,
            messages: buildMessages(options),
            stream: true,
        });
        let full = "";
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) { options.onChunk(delta); full += delta; }
        }
        return { ok: true, text: full };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, text: `Groq error: ${msg}` };
    }
}
GROQ_END
}

write_ollama_ts() {
cat > "backend/src/providers/ai/deepai.ts" << 'OLLAMA_END'
// Generated by setup.sh — provider: Ollama (local)
// No npm package required. Set OLLAMA_BASE_URL in .env if not on localhost:11434.

export type MessageRole = "user" | "assistant" | "system";

export interface TextContentBlock { type: "text"; text: string; }
export interface ImageContentBlock {
    type: "image";
    source: { data: string; media_type?: string; };
}
export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface DeepAIMessage {
    role: MessageRole;
    content: string | ContentBlock[];
}
export interface DeepAICallOptions {
    model: string;
    system?: string;
    messages: DeepAIMessage[];
}
export interface DeepAIStreamOptions extends DeepAICallOptions {
    onChunk?: (chunk: string) => void;
}
export interface DeepAIStreamResult { ok: boolean; text: string; }

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

interface OllamaMsg { role: string; content: string; }
interface OllamaResp { message?: { content?: string }; done?: boolean; }

function toText(content: string | ContentBlock[]): string {
    if (typeof content === "string") return content;
    return content.filter(b => b.type === "text").map(b => (b as TextContentBlock).text).join("\n");
}

function buildMessages(options: DeepAICallOptions): OllamaMsg[] {
    const msgs: OllamaMsg[] = [];
    if (options.system) msgs.push({ role: "system", content: options.system });
    for (const m of options.messages) msgs.push({ role: m.role, content: toText(m.content) });
    return msgs;
}

export async function callDeepAI(options: DeepAICallOptions): Promise<string> {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: options.model, messages: buildMessages(options), stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);
    const data = await res.json() as OllamaResp;
    return data.message?.content ?? "";
}

export async function streamDeepAI(options: DeepAIStreamOptions): Promise<DeepAIStreamResult> {
    try {
        if (!options.onChunk) {
            return { ok: true, text: await callDeepAI(options) };
        }
        const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: options.model, messages: buildMessages(options), stream: true }),
        });
        if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let full = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of dec.decode(value).split("\n")) {
                if (!line.trim()) continue;
                try {
                    const obj = JSON.parse(line) as OllamaResp;
                    if (obj.message?.content) { options.onChunk(obj.message.content); full += obj.message.content; }
                } catch { /* skip malformed chunks */ }
            }
        }
        return { ok: true, text: full };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, text: `Ollama error: ${msg}` };
    }
}
OLLAMA_END
}

write_custom_ts() {
cat > "backend/src/providers/ai/deepai.ts" << 'CUSTOM_END'
// Generated by setup.sh — provider: Custom (OpenAI-compatible endpoint)
// Requires:  npm install openai
// Set CUSTOM_AI_BASE_URL and CUSTOM_AI_API_KEY in .env
import OpenAI from "openai";

export type MessageRole = "user" | "assistant" | "system";

export interface TextContentBlock { type: "text"; text: string; }
export interface ImageContentBlock {
    type: "image";
    source: { data: string; media_type?: string; };
}
export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface DeepAIMessage {
    role: MessageRole;
    content: string | ContentBlock[];
}
export interface DeepAICallOptions {
    model: string;
    system?: string;
    messages: DeepAIMessage[];
}
export interface DeepAIStreamOptions extends DeepAICallOptions {
    onChunk?: (chunk: string) => void;
}
export interface DeepAIStreamResult { ok: boolean; text: string; }

const client = new OpenAI({
    apiKey: process.env.CUSTOM_AI_API_KEY ?? "not-set",
    baseURL: process.env.CUSTOM_AI_BASE_URL ?? "http://localhost:8080/v1",
});

function buildMessages(
    options: DeepAICallOptions,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (options.system) msgs.push({ role: "system", content: options.system });
    for (const m of options.messages) {
        if (typeof m.content === "string") {
            msgs.push({ role: m.role as "user" | "assistant", content: m.content });
        } else {
            msgs.push({
                role: m.role as "user" | "assistant",
                content: m.content.map(b =>
                    b.type === "text"
                        ? { type: "text" as const, text: b.text }
                        : {
                            type: "image_url" as const,
                            image_url: {
                                url: `data:${b.source.media_type ?? "image/png"};base64,${b.source.data}`,
                            },
                          }
                ),
            });
        }
    }
    return msgs;
}

export async function callDeepAI(options: DeepAICallOptions): Promise<string> {
    const res = await client.chat.completions.create({
        model: options.model,
        messages: buildMessages(options),
    });
    return res.choices[0]?.message?.content ?? "";
}

export async function streamDeepAI(options: DeepAIStreamOptions): Promise<DeepAIStreamResult> {
    try {
        if (!options.onChunk) {
            return { ok: true, text: await callDeepAI(options) };
        }
        const stream = await client.chat.completions.create({
            model: options.model,
            messages: buildMessages(options),
            stream: true,
        });
        let full = "";
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) { options.onChunk(delta); full += delta; }
        }
        return { ok: true, text: full };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, text: `Custom AI error: ${msg}` };
    }
}
CUSTOM_END
}

# ═══════════════════════════════════════════════════════════════
#  BANNER
# ═══════════════════════════════════════════════════════════════
clear
echo -e "${C}${W}"
cat << 'BANNER'

  ╔══════════════════════════════════════════════════════╗
  ║                                                      ║
  ║        finance.qyzar.eu  ─  Setup Wizard             ║
  ║                                                      ║
  ║   AI provider  ·  environment variables              ║
  ║   dependencies  ·  connectivity debug                ║
  ║                                                      ║
  ╚══════════════════════════════════════════════════════╝

BANNER
echo -e "${NC}"

# ═══════════════════════════════════════════════════════════════
#  STEP 0 — PREREQUISITES
# ═══════════════════════════════════════════════════════════════
section "0 / 5  —  Prerequisites"

# Must run from project root
if [[ ! -d "backend" || ! -d "frontend" ]]; then
  fail "Run this script from the project root (the folder containing backend/ and frontend/)."
  exit 1
fi
ok "Running from project root"

# Node.js ≥ 20
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install ≥ 20:  https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -e "process.stdout.write(process.version.slice(1))")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if (( NODE_MAJOR < 20 )); then
  fail "Node.js $NODE_VER — need ≥ 20.  https://nodejs.org"
  exit 1
fi
ok "Node.js $NODE_VER"
chk "Node.js ≥ 20" "pass"

# npm
if ! command -v npm &>/dev/null; then
  fail "npm not found."
  exit 1
fi
ok "npm $(npm --version)"

# psql (optional)
HAVE_PSQL=false
if command -v psql &>/dev/null; then
  ok "psql available  ($(psql --version | head -1))"
  HAVE_PSQL=true
else
  warn "psql not found — DB check will use a Node.js fallback"
fi

# curl (optional, for AI provider ping)
HAVE_CURL=false
if command -v curl &>/dev/null; then
  ok "curl available"
  HAVE_CURL=true
else
  warn "curl not found — AI connectivity check will be skipped"
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 1 — AI PROVIDER
# ═══════════════════════════════════════════════════════════════
section "1 / 5  —  AI Provider"

DEEPAI_PATH="backend/src/providers/ai/deepai.ts"

# Initialize variables (used by later steps even when this step is skipped)
AI_CHOICE=""; AI_NAME=""; AI_PKG="none"; AI_KEY_ENV=""
AI_MODEL=""; AI_MODEL_LITE=""; AI_API_KEY=""; AI_BASE_URL=""; WRITE_DEEPAI=false

if [[ -f "$DEEPAI_PATH" ]]; then
  # deepai.ts is already present — this is the private implementation.
  # Never offer to overwrite it; skip this step entirely.
  ok "deepai.ts is already configured — skipping AI provider setup"
  dim  "  (backend/src/providers/ai/deepai.ts is gitignored and private)"
  echo
  # Still need a model name for the .env agent assignments
  pick_model AI_MODEL     "Primary model  (discovery · synthesis agents)"
  pick_model AI_MODEL_LITE "Lite model    (risk · monitoring agents — can be same or cheaper)"
else
  echo -e "  ${W}All agents call your LLM through two functions:${NC}"
  echo -e "  ${C}callDeepAI${NC}  and  ${C}streamDeepAI${NC}${D}  (backend/src/providers/ai/deepai.ts)${NC}"
  echo -e "  ${D}This wizard generates that file for you from a public provider template.${NC}"
  echo

  echo -e "  ${Y}Select a provider:${NC}"
  echo
  echo -e "  ${C}1)${NC}  ${W}OpenAI${NC}          ${D}GPT-4o · GPT-4.1 · o3 · o4-mini · ...${NC}"
  echo -e "  ${C}2)${NC}  ${W}Anthropic${NC}       ${D}Claude Opus · Sonnet · Haiku · ...${NC}"
  echo -e "  ${C}3)${NC}  ${W}Groq${NC}            ${D}Llama 3.3 · Mixtral · Gemma  (ultra-fast)${NC}"
  echo -e "  ${C}4)${NC}  ${W}Ollama${NC}          ${D}local models — no API key required${NC}"
  echo -e "  ${C}5)${NC}  ${W}Custom${NC}          ${D}any OpenAI-compatible endpoint${NC}"
  echo

  while true; do
    printf "  ${Y}Choice${NC} ${D}[1-5]${NC}: "
    read -r AI_CHOICE
    [[ "$AI_CHOICE" =~ ^[1-5]$ ]] && break
    warn "Enter a number between 1 and 5."
  done

  case "$AI_CHOICE" in
    1) AI_NAME="OpenAI";    AI_PKG="openai";           AI_KEY_ENV="OPENAI_API_KEY";
       AI_KEY_URL="https://platform.openai.com/api-keys"         ;;
    2) AI_NAME="Anthropic"; AI_PKG="@anthropic-ai/sdk"; AI_KEY_ENV="ANTHROPIC_API_KEY";
       AI_KEY_URL="https://console.anthropic.com/settings/keys"  ;;
    3) AI_NAME="Groq";      AI_PKG="groq-sdk";          AI_KEY_ENV="GROQ_API_KEY";
       AI_KEY_URL="https://console.groq.com/keys"                ;;
    4) AI_NAME="Ollama";    AI_PKG="none";              AI_KEY_ENV="";
       AI_KEY_URL="https://ollama.com/download"                  ;;
    5) AI_NAME="Custom";    AI_PKG="openai";            AI_KEY_ENV="CUSTOM_AI_API_KEY";
       AI_KEY_URL=""                                             ;;
  esac

  echo
  info "Provider: ${W}$AI_NAME${NC}"

  # Primary model — used by discovery, synthesis, and decision agents
  pick_model AI_MODEL "Primary model  ${D}(discovery · synthesis · decision agents)${NC}"
  info "Primary model: ${W}$AI_MODEL${NC}"

  # Lite model — optional separate model for risk + monitoring agents
  echo
  echo -e "  ${D}Risk and monitoring agents run more frequently and can use a cheaper/faster model.${NC}"
  if ask_yn "Use a separate lite model for risk + monitoring agents?"; then
    pick_model AI_MODEL_LITE "Lite model  ${D}(risk · monitoring · shortfall agents)${NC}"
    info "Lite model: ${W}$AI_MODEL_LITE${NC}"
  else
    AI_MODEL_LITE="$AI_MODEL"
    info "Using ${W}$AI_MODEL${NC} for all agents"
  fi

  # API key
  if [[ "$AI_CHOICE" != "4" ]]; then
    echo
    info "Get your API key:"
    [[ -n "${AI_KEY_URL-}" ]] && link "$AI_KEY_URL"
    ask_secret AI_API_KEY "$AI_KEY_ENV"
  fi

  # Base URL for Ollama / Custom
  if [[ "$AI_CHOICE" == "4" ]]; then
    ask AI_BASE_URL "Ollama base URL" "http://localhost:11434"
  elif [[ "$AI_CHOICE" == "5" ]]; then
    ask AI_BASE_URL "Endpoint base URL" "http://localhost:8080/v1"
  fi

  WRITE_DEEPAI=true
  case "$AI_CHOICE" in
    1) write_openai_ts    ;;
    2) write_anthropic_ts ;;
    3) write_groq_ts      ;;
    4) write_ollama_ts    ;;
    5) write_custom_ts    ;;
  esac
  ok "Wrote $DEEPAI_PATH  (provider: $AI_NAME)"
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 2 — ENVIRONMENT VARIABLES
# ═══════════════════════════════════════════════════════════════
section "2 / 5  —  Environment Variables"

echo -e "  ${D}You will be walked through each key. Press Enter to keep the default.${NC}"
echo -e "  ${D}Optional keys can be skipped — you can fill them in later.${NC}"
echo

# Check existing .env
OVERWRITE_ENV=true
if [[ -f "backend/.env" ]]; then
  warn "backend/.env already exists."
  if ! ask_yn "Overwrite it with new values?"; then
    OVERWRITE_ENV=false
    info "Keeping existing backend/.env — skipping variable walkthrough."
  fi
fi

# Initialize all variable holders with defaults
V_WS_PORT="3000"
V_DATABASE_URL=""
V_ALPHA_VANTAGE=""
V_FMP=""
V_POLYGON=""
V_FINNHUB=""
V_COINGECKO=""
V_CURRENTSAPI=""
V_GUARDIAN=""
V_REDDIT_ID=""; V_REDDIT_SECRET=""; V_REDDIT_UA=""
V_SERPAPI=""
V_FRED=""
V_CENSUS=""
V_LDA=""
V_SEC_UA=""
V_GNEWS=""
V_STOCKTWITS=""
V_FIREBASE_PATH=""
V_FE_WS_URL="ws://localhost:3000"

if [[ "$OVERWRITE_ENV" == "true" ]]; then

  # ── Server ──────────────────────────────────────────────────
  echo -e "\n  ${W}── Server ────────────────────────────────────────────${NC}"
  ask V_WS_PORT "WebSocket port" "3000"

  # ── Database ────────────────────────────────────────────────
  echo -e "\n  ${W}── Database ──────────────────────────────────────────${NC}"
  echo -e "  ${D}PostgreSQL connection string. Format:${NC}"
  echo -e "  ${D}  postgresql://USER:PASSWORD@HOST:5432/DBNAME${NC}"
  ask V_DATABASE_URL "DATABASE_URL" "postgresql://user:password@localhost:5432/qyzar_finance"

  # ── Alpha Vantage ───────────────────────────────────────────
  echo -e "\n  ${W}── Alpha Vantage  (equities, technicals, fundamentals) ──${NC}"
  link "https://www.alphavantage.co/support/#api-key  [free]"
  ask_opt_secret V_ALPHA_VANTAGE "ALPHA_VANTAGE_API_KEY"

  # ── FMP ─────────────────────────────────────────────────────
  echo -e "\n  ${W}── Financial Modeling Prep  (quotes, financials, news) ──${NC}"
  dim "Free tier: 250 calls/day. HTTP 402 = quota exhausted."
  link "https://site.financialmodelingprep.com/developer/docs  [free]"
  ask_opt_secret V_FMP "FMP_API_KEY"

  # ── Polygon / Massive ────────────────────────────────────────
  echo -e "\n  ${W}── Polygon.io  (market aggregates, snapshots) ──────────${NC}"
  link "https://polygon.io/dashboard/signup  [free tier available]"
  ask_opt_secret V_POLYGON "POLYGON_API_KEY"

  # ── Finnhub ─────────────────────────────────────────────────
  echo -e "\n  ${W}── Finnhub  (quotes, candles, sentiment) ───────────────${NC}"
  link "https://finnhub.io/register  [free]"
  ask_opt_secret V_FINNHUB "FINNHUB_API_KEY"

  # ── CoinGecko ───────────────────────────────────────────────
  echo -e "\n  ${W}── CoinGecko  (crypto prices & market data) ────────────${NC}"
  dim "Public endpoints work without a key. Demo key unlocks higher rate limits."
  link "https://www.coingecko.com/en/api/pricing  [optional]"
  ask_opt_secret V_COINGECKO "COINGECKO_API_KEY  (optional)"

  # ── Currents API ────────────────────────────────────────────
  echo -e "\n  ${W}── Currents API  (global news headlines) ───────────────${NC}"
  link "https://currentsapi.services/en/register  [free]"
  ask_opt_secret V_CURRENTSAPI "CURRENTSAPI_API_KEY"

  # ── The Guardian ────────────────────────────────────────────
  echo -e "\n  ${W}── The Guardian  (international editorial news) ─────────${NC}"
  link "https://open-platform.theguardian.com/access/  [free]"
  ask_opt_secret V_GUARDIAN "GUARDIAN_API_KEY"

  # ── Reddit ──────────────────────────────────────────────────
  echo -e "\n  ${W}── Reddit  (retail sentiment & discussion) ─────────────${NC}"
  dim "Create a 'script' type app — takes about 2 minutes."
  link "https://www.reddit.com/prefs/apps"
  ask_opt_secret V_REDDIT_ID     "REDDIT_CLIENT_ID      (optional)"
  ask_opt_secret V_REDDIT_SECRET "REDDIT_CLIENT_SECRET  (optional)"
  ask_opt         V_REDDIT_UA    "REDDIT_USER_AGENT" "finance-qyzar/1.0 by /u/yourusername"

  # ── SerpAPI ─────────────────────────────────────────────────
  echo -e "\n  ${W}── SerpAPI  (Google Trends signals) ────────────────────${NC}"
  dim "Optional — Google Trends data only."
  link "https://serpapi.com/manage-api-key  [100 free searches/month]"
  ask_opt_secret V_SERPAPI "SERPAPI_API_KEY  (optional)"

  # ── FRED ────────────────────────────────────────────────────
  echo -e "\n  ${W}── FRED  (St. Louis Fed macroeconomic data) ────────────${NC}"
  link "https://fred.stlouisfed.org/docs/api/api_key.html  [free]"
  ask_opt_secret V_FRED "FRED_API_KEY"

  # ── Census ──────────────────────────────────────────────────
  echo -e "\n  ${W}── U.S. Census  (demographic & economic data) ──────────${NC}"
  link "https://api.census.gov/data/key_signup.html  [free]"
  ask_opt_secret V_CENSUS "CENSUS_API_KEY"

  # ── LDA ─────────────────────────────────────────────────────
  echo -e "\n  ${W}── LDA.gov  (federal lobbying disclosures) ──────────────${NC}"
  link "https://lda.gov/api/register/"
  ask_opt_secret V_LDA "LDA_API_KEY  (optional)"

  # ── SEC EDGAR ───────────────────────────────────────────────
  echo -e "\n  ${W}── SEC EDGAR  (filings, XBRL — no API key) ─────────────${NC}"
  dim "SEC requires a descriptive User-Agent string with a contact email."
  dim "Example:  MyApp/1.0 contact@example.com"
  link "https://www.sec.gov/os/webmaster-faq#code-support"
  ask_opt V_SEC_UA "SEC_USER_AGENT" "finance-qyzar/1.0 contact@example.com"

  # ── GNews ───────────────────────────────────────────────────
  echo -e "\n  ${W}── GNews  (news search & headlines) ────────────────────${NC}"
  dim "Disabled by default due to timeouts. Set GNEWS_ENABLED=true to activate."
  link "https://gnews.io/  [free tier: 100 requests/day]"
  ask_opt_secret V_GNEWS "GNEWS_API_KEY  (optional)"

  # ── StockTwits ──────────────────────────────────────────────
  echo -e "\n  ${W}── StockTwits  (retail ticker sentiment) ───────────────${NC}"
  link "https://api.stocktwits.com/developers"
  ask_opt_secret V_STOCKTWITS "STOCKTWITS_CLIENT_ID  (optional)"

  # ── Firebase ────────────────────────────────────────────────
  echo -e "\n  ${W}── Firebase  (push notifications — optional) ────────────${NC}"
  dim "Download a service account JSON: Firebase Console › Project Settings › Service Accounts"
  ask_opt V_FIREBASE_PATH "Path to firebase-service-account.json  (optional)"

  # ── Frontend WS URL ─────────────────────────────────────────
  echo -e "\n  ${W}── Frontend WebSocket URL ───────────────────────────────${NC}"
  dim "URL the browser connects to. Change this for production deployments."
  ask V_FE_WS_URL "NEXT_PUBLIC_WS_URL" "ws://localhost:${V_WS_PORT}"

fi  # end OVERWRITE_ENV

# ═══════════════════════════════════════════════════════════════
#  WRITE FILES
# ═══════════════════════════════════════════════════════════════
if [[ "$OVERWRITE_ENV" == "true" ]]; then
  echo
  info "Writing backend/.env ..."

  # Build AI key line(s)
  AI_KEY_LINES=""
  if [[ "$AI_CHOICE" == "4" ]]; then
    AI_KEY_LINES="OLLAMA_BASE_URL=${AI_BASE_URL}"
  elif [[ "$AI_CHOICE" == "5" ]]; then
    AI_KEY_LINES="CUSTOM_AI_BASE_URL=${AI_BASE_URL}
CUSTOM_AI_API_KEY=${AI_API_KEY}"
  else
    AI_KEY_LINES="${AI_KEY_ENV}=${AI_API_KEY}"
  fi

  # Firebase line
  FIREBASE_LINES=""
  [[ -n "$V_FIREBASE_PATH" ]] && FIREBASE_LINES="FIREBASE_SERVICE_ACCOUNT_PATH=${V_FIREBASE_PATH}"

  {
    printf '%s\n' "# finance.qyzar.eu backend — generated by setup.sh"
    printf '%s\n' "# DO NOT COMMIT THIS FILE."
    printf '%s\n' ""
    printf '%s\n' "# Server"
    printf '%s=%s\n' "WS_PORT" "$V_WS_PORT"
    printf '%s\n' ""
    printf '%s\n' "# Database"
    printf '%s=%s\n' "DATABASE_URL" "$V_DATABASE_URL"
    printf '%s\n' ""
    printf '%s\n' "# AI Provider — $AI_NAME"
    printf '%s\n' "$AI_KEY_LINES"
    printf '%s\n' ""
    printf '%s\n' "# Agent models"
    printf '%s\n' "# Primary (discovery · synthesis · decision): $AI_MODEL"
    printf '%s\n' "# Lite    (risk · monitoring · shortfall):    $AI_MODEL_LITE"
    printf '%s=%s\n' "AGENT_MODEL"                      "$AI_MODEL"
    printf '%s\n' ""
    printf '%s\n' "# Phase 1 — broad market scan (primary model)"
    printf '%s=%s\n' "AGENT_MODEL_COMMODITIES"          "$AI_MODEL"
    printf '%s=%s\n' "AGENT_MODEL_CRYPTO_ANALYSIS"      "$AI_MODEL"
    printf '%s=%s\n' "AGENT_MODEL_MACROECONOMIC"        "$AI_MODEL"
    printf '%s\n' ""
    printf '%s\n' "# Phase 2 — opportunity identification (primary model)"
    printf '%s=%s\n' "AGENT_MODEL_FUTURE_OPPORTUNIST"   "$AI_MODEL"
    printf '%s=%s\n' "AGENT_MODEL_CONSERVATIONIST"      "$AI_MODEL"
    printf '%s=%s\n' "AGENT_MODEL_INDUSTRY_SURGE"       "$AI_MODEL"
    printf '%s\n' ""
    printf '%s\n' "# Phase 3 — risk assessment"
    printf '%s=%s\n' "AGENT_MODEL_REGULATORY_DISCOVERY" "$AI_MODEL"
    printf '%s=%s\n' "AGENT_MODEL_RISK_POLITICAL"       "$AI_MODEL_LITE"
    printf '%s=%s\n' "AGENT_MODEL_RISK_GOVERNANCE"      "$AI_MODEL_LITE"
    printf '%s=%s\n' "AGENT_MODEL_RISK_FINANCIAL"       "$AI_MODEL_LITE"
    printf '%s=%s\n' "AGENT_MODEL_RISK_MARKET"          "$AI_MODEL_LITE"
    printf '%s=%s\n' "AGENT_MODEL_RISK_REPUTATION"      "$AI_MODEL_LITE"
    printf '%s\n' ""
    printf '%s\n' "# Synthesis + utility"
    printf '%s=%s\n' "AGENT_MODEL_DOSSIER"              "$AI_MODEL"
    printf '%s=%s\n' "AGENT_MODEL_SHORTFALL"            "$AI_MODEL_LITE"
    printf '%s\n' ""
    printf '%s\n' "# Data Providers"
    printf '%s=%s\n' "ALPHA_VANTAGE_API_KEY"  "$V_ALPHA_VANTAGE"
    printf '%s=%s\n' "FMP_API_KEY"            "$V_FMP"
    printf '%s=%s\n' "POLYGON_API_KEY"        "$V_POLYGON"
    printf '%s=%s\n' "MASSIVE_API_KEY"        "$V_POLYGON"
    printf '%s=%s\n' "FINNHUB_API_KEY"        "$V_FINNHUB"
    printf '%s=%s\n' "COINGECKO_API_KEY"      "$V_COINGECKO"
    printf '%s=%s\n' "CURRENTSAPI_API_KEY"    "$V_CURRENTSAPI"
    printf '%s=%s\n' "GUARDIAN_API_KEY"       "$V_GUARDIAN"
    printf '%s=%s\n' "REDDIT_CLIENT_ID"       "$V_REDDIT_ID"
    printf '%s=%s\n' "REDDIT_CLIENT_SECRET"   "$V_REDDIT_SECRET"
    printf '%s=%s\n' "REDDIT_USER_AGENT"      "${V_REDDIT_UA:-finance-qyzar/1.0}"
    printf '%s=%s\n' "SERPAPI_API_KEY"        "$V_SERPAPI"
    printf '%s=%s\n' "FRED_API_KEY"           "$V_FRED"
    printf '%s=%s\n' "CENSUS_API_KEY"         "$V_CENSUS"
    printf '%s=%s\n' "LDA_API_KEY"            "$V_LDA"
    printf '%s=%s\n' "SEC_USER_AGENT"         "${V_SEC_UA:-finance-qyzar/1.0 contact@example.com}"
    printf '%s=%s\n' "GNEWS_ENABLED"          "false"
    printf '%s=%s\n' "GNEWS_API_KEY"          "$V_GNEWS"
    printf '%s=%s\n' "STOCKTWITS_CLIENT_ID"   "$V_STOCKTWITS"
    printf '%s\n' ""
    [[ -n "$FIREBASE_LINES" ]] && { printf '%s\n' "# Firebase"; printf '%s\n' "$FIREBASE_LINES"; printf '%s\n' ""; }
    printf '%s\n' "# Scheduler"
    printf '%s=%s\n' "SCHEDULER_ENABLED"       "true"
    printf '%s=%s\n' "SYSTEM_ACCOUNT_ID"       "00000000-0000-0000-0000-000000000001"
    printf '%s=%s\n' "SCHEDULER_TIMEZONE"      "America/New_York"
    printf '%s=%s\n' "DISCOVERY_CRON"          "0 * * * *"
    printf '%s=%s\n' "MONITOR_P1_CRON"         "0 * * * *"
    printf '%s=%s\n' "MONITOR_P2_CRON"         "0 */6 * * *"
    printf '%s=%s\n' "MONITOR_P3_CRON"         "0 5 * * *"
    printf '%s=%s\n' "MONITOR_BATCH_SIZE"      "20"
    printf '%s=%s\n' "EVENT_POLL_CRON"         "*/15 * * * *"
    printf '%s=%s\n' "EVENT_AI_ENABLED"        "true"
    printf '%s=%s\n' "EVENT_MAX_HEADLINES"     "180"
    printf '%s=%s\n' "EVENT_HEADLINE_BATCH_SIZE" "50"
    printf '%s=%s\n' "EVENT_MAX_PER_TICK"      "5"
    printf '%s=%s\n' "WATCHLIST_NASDAQ_SEED"       "true"
    printf '%s=%s\n' "WATCHLIST_NASDAQ_SEED_LIMIT" "500"
    printf '%s=%s\n' "WATCHLIST_P1_INTERVAL_MS"    "3600000"
    printf '%s=%s\n' "WATCHLIST_P2_INTERVAL_MS"    "21600000"
    printf '%s=%s\n' "WATCHLIST_P3_INTERVAL_MS"    "86400000"
    printf '%s=%s\n' "WATCHLIST_REVIEWER_CRON"     "0 21 * * 1-5"
    printf '%s=%s\n' "WATCHLIST_REVIEWER_MAX_COMPANIES"   "100"
    printf '%s=%s\n' "WATCHLIST_REVIEWER_MAX_CORRELATIONS" "12"
    printf '%s=%s\n' "CORRELATION_LOOKBACK_MS"   "3600000"
    printf '%s=%s\n' "CORRELATION_MAX_PER_RUN"   "5"
    printf '%s=%s\n' "AGENT_MAX_TOOL_ITERATIONS" "100"
    printf '%s=%s\n' "AGENT_MAX_RESEARCH_PASSES" "50"
    printf '%s=%s\n' "AGENT_MAX_IDLE_PASSES"     "3"
    printf '%s=%s\n' "DEEPAI_REQUEST_TIMEOUT_MS" "120000"
    printf '%s=%s\n' "WIDGET_AGENT_ENABLED"      "true"
    printf '%s\n' ""
    printf '%s\n' "# Cache TTLs (ms)"
    printf '%s=%s\n' "PUBLIC_STOCK_CACHE_TTL_MS"    "900000"
    printf '%s=%s\n' "CHART_DAILY_CACHE_TTL_MS"     "21600000"
    printf '%s=%s\n' "CHART_INTRADAY_CACHE_TTL_MS"  "300000"
    printf '%s=%s\n' "CACHE_DEFAULT_TTL_MS"         "3600000"
    printf '%s=%s\n' "CACHE_HOT_TTL_MS"             "60000"
    printf '%s=%s\n' "CACHE_WARM_TTL_MS"            "900000"
    printf '%s=%s\n' "CACHE_MEDIUM_TTL_MS"          "14400000"
    printf '%s=%s\n' "CACHE_COLD_TTL_MS"            "21600000"
    printf '%s=%s\n' "CACHE_STATIC_TTL_MS"          "604800000"
    printf '%s=%s\n' "CACHE_STALE_MAX_MS"           "604800000"
    printf '%s=%s\n' "CACHE_PURGE_CRON"             "0 3 * * *"
    printf '%s\n' ""
    printf '%s\n' "# API Health Check"
    printf '%s=%s\n' "API_HEALTH_CHECK_ENABLED"     "true"
    printf '%s=%s\n' "API_HEALTH_CHECK_CRON"        "*/5 * * * *"
    printf '%s=%s\n' "API_HEALTH_CHECK_ON_STARTUP"  "true"
  } > "backend/.env"

  ok "Wrote backend/.env"

  # Frontend .env.local
  printf 'NEXT_PUBLIC_WS_URL=%s\n' "$V_FE_WS_URL" > "frontend/.env.local"
  ok "Wrote frontend/.env.local  (NEXT_PUBLIC_WS_URL=${V_FE_WS_URL})"
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 3 — INSTALL DEPENDENCIES
# ═══════════════════════════════════════════════════════════════
section "3 / 5  —  Install Dependencies"

# Backend base install
echo
spin_start "npm install  (backend)"
(cd backend && npm install --silent) > /tmp/qyzar_npm_be.log 2>&1
NPM_BE_EXIT=$?
spin_stop
if (( NPM_BE_EXIT == 0 )); then
  ok "backend  npm install"
  chk "npm install (backend)" "pass"
else
  fail "backend  npm install  — see /tmp/qyzar_npm_be.log"
  chk "npm install (backend)" "fail"
fi

# Install AI provider package
if [[ "$AI_PKG" != "none" ]]; then
  spin_start "npm install $AI_PKG  (AI provider)"
  (cd backend && npm install "$AI_PKG" --silent) > /tmp/qyzar_npm_ai.log 2>&1
  NPM_AI_EXIT=$?
  spin_stop
  if (( NPM_AI_EXIT == 0 )); then
    ok "Installed $AI_PKG"
    chk "npm install $AI_PKG" "pass"
  else
    fail "Failed to install $AI_PKG  — see /tmp/qyzar_npm_ai.log"
    chk "npm install $AI_PKG" "fail"
  fi
fi

# Frontend install
spin_start "npm install  (frontend)"
(cd frontend && npm install --silent) > /tmp/qyzar_npm_fe.log 2>&1
NPM_FE_EXIT=$?
spin_stop
if (( NPM_FE_EXIT == 0 )); then
  ok "frontend  npm install"
  chk "npm install (frontend)" "pass"
else
  fail "frontend  npm install  — see /tmp/qyzar_npm_fe.log"
  chk "npm install (frontend)" "fail"
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 4 — DEBUG CHECKS
# ═══════════════════════════════════════════════════════════════
section "4 / 5  —  Debug Checks"

# ── 4a: TypeScript compile ──────────────────────────────────
echo -e "  ${W}TypeScript compile (backend)${NC}"
spin_start "Running tsc --noEmit ..."
(cd backend && npx tsc --noEmit 2>&1) > /tmp/qyzar_tsc.log
TSC_EXIT=$?
spin_stop
if (( TSC_EXIT == 0 )); then
  ok "TypeScript: no errors"
  chk "TypeScript compile" "pass"
else
  # Count errors
  TSC_ERRORS=$(grep -c "error TS" /tmp/qyzar_tsc.log 2>/dev/null || echo "?")
  warn "TypeScript: $TSC_ERRORS error(s) found"
  dim  "  First 5 errors:"
  grep "error TS" /tmp/qyzar_tsc.log 2>/dev/null | head -5 | while IFS= read -r line; do
    echo -e "  ${D}  $line${NC}"
  done
  chk "TypeScript compile" "warn"
fi

echo

# ── 4b: Database connectivity ───────────────────────────────
echo -e "  ${W}Database connectivity${NC}"
# Load DATABASE_URL from the .env we just wrote (or existing)
_DB_URL=""
if [[ -f "backend/.env" ]]; then
  _DB_URL=$(grep -E '^DATABASE_URL=' "backend/.env" | head -1 | cut -d= -f2-)
fi
if [[ -z "$_DB_URL" || "$_DB_URL" == "postgresql://user:password@localhost:5432/qyzar_finance" ]]; then
  warn "DATABASE_URL looks like a placeholder — skipping DB check"
  chk "Database" "skip"
else
  if $HAVE_PSQL; then
    spin_start "Testing database connection ..."
    if psql "$_DB_URL" -c "SELECT 1;" > /tmp/qyzar_db.log 2>&1; then
      spin_stop; ok "Database connected  (psql)"
      chk "Database" "pass"
    else
      spin_stop; fail "Database unreachable:  $(head -1 /tmp/qyzar_db.log)"
      chk "Database" "fail"
    fi
  else
    # Node.js fallback using pg
    spin_start "Testing database connection  (node) ..."
    (cd backend && node -e "
const { Client } = require('pg');
require('dotenv').config();
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.query('SELECT 1'))
  .then(() => { process.stdout.write('ok\n'); c.end(); process.exit(0); })
  .catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
" 2>/tmp/qyzar_db.log)
    DB_EXIT=$?
    spin_stop
    if (( DB_EXIT == 0 )); then
      ok "Database connected  (node)"
      chk "Database" "pass"
    else
      fail "Database: $(cat /tmp/qyzar_db.log)"
      chk "Database" "fail"
    fi
  fi
fi

echo

# ── 4c: AI provider connectivity ────────────────────────────
echo -e "  ${W}AI provider connectivity  ($AI_NAME)${NC}"

if ! $HAVE_CURL; then
  warn "curl not available — skipping AI connectivity check"
  chk "AI provider ping" "skip"
elif [[ "$AI_CHOICE" == "4" ]]; then
  # Ollama — just check if the server is reachable
  spin_start "Pinging Ollama at ${AI_BASE_URL} ..."
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${AI_BASE_URL}/api/tags" 2>/dev/null || echo "000")
  spin_stop
  if [[ "$HTTP_CODE" == "200" ]]; then
    ok "Ollama is running at ${AI_BASE_URL}"
    chk "AI provider ping" "pass"
  else
    fail "Ollama not reachable at ${AI_BASE_URL}  (HTTP $HTTP_CODE)"
    dim  "  Start Ollama:  ollama serve"
    chk "AI provider ping" "fail"
  fi
elif [[ -n "$AI_API_KEY" ]]; then
  spin_start "Validating $AI_KEY_ENV ..."
  case "$AI_CHOICE" in
    1) AI_PING_URL="https://api.openai.com/v1/models"
       AI_PING_HEADER="Authorization: Bearer ${AI_API_KEY}" ;;
    2) AI_PING_URL="https://api.anthropic.com/v1/models"
       AI_PING_HEADER="x-api-key: ${AI_API_KEY}" ;;
    3) AI_PING_URL="https://api.groq.com/openai/v1/models"
       AI_PING_HEADER="Authorization: Bearer ${AI_API_KEY}" ;;
    5) AI_PING_URL="${AI_BASE_URL}/models"
       AI_PING_HEADER="Authorization: Bearer ${AI_API_KEY}" ;;
  esac

  EXTRA_HEADER=""
  [[ "$AI_CHOICE" == "2" ]] && EXTRA_HEADER="-H \"anthropic-version: 2023-06-01\""

  HTTP_CODE=$(eval curl -s -o /dev/null -w '"%{http_code}"' --max-time 10 \
    -H '"'"${AI_PING_HEADER}"'"' \
    $EXTRA_HEADER \
    '"'"${AI_PING_URL}"'"' 2>/dev/null || echo "000")
  spin_stop

  if [[ "$HTTP_CODE" == "200" ]]; then
    ok "$AI_NAME API key is valid  (HTTP 200)"
    chk "AI provider ping" "pass"
  elif [[ "$HTTP_CODE" == "401" ]]; then
    fail "$AI_NAME: invalid API key  (HTTP 401)"
    chk "AI provider ping" "fail"
  elif [[ "$HTTP_CODE" == "000" ]]; then
    warn "$AI_NAME: could not reach server  (network issue or firewall)"
    chk "AI provider ping" "warn"
  else
    warn "$AI_NAME: HTTP $HTTP_CODE  (key may still be valid — some endpoints behave differently)"
    chk "AI provider ping" "warn"
  fi
else
  warn "No API key was entered — skipping AI connectivity check"
  chk "AI provider ping" "skip"
fi

# ═══════════════════════════════════════════════════════════════
#  STEP 5 — SUMMARY
# ═══════════════════════════════════════════════════════════════
section "5 / 5  —  Summary"

PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0

for i in "${!_CNAMES[@]}"; do
  name="${_CNAMES[$i]}"
  status="${_CSTATUS[$i]}"
  case "$status" in
    pass) ok   "$name"; (( PASS_COUNT++ )) ;;
    fail) fail "$name"; (( FAIL_COUNT++ )) ;;
    warn) warn "$name"; (( WARN_COUNT++ )) ;;
    skip) dim  "  (skipped)  $name" ;;
  esac
done

echo
echo -e "  ${D}─────────────────────────────────────────────────${NC}"

if [[ "$WRITE_DEEPAI" == "true" ]]; then
  ok "backend/src/providers/ai/deepai.ts  →  $AI_NAME"
fi
[[ "$OVERWRITE_ENV" == "true" ]] && ok "backend/.env  written"
[[ "$OVERWRITE_ENV" == "true" ]] && ok "frontend/.env.local  written"

echo
if (( FAIL_COUNT == 0 )); then
  echo -e "  ${G}${W}All checks passed${NC} ${D}(${PASS_COUNT} pass · ${WARN_COUNT} warn)${NC}"
else
  echo -e "  ${R}${W}${FAIL_COUNT} check(s) failed${NC} ${D}(${PASS_COUNT} pass · ${WARN_COUNT} warn)${NC}"
  echo -e "  ${D}Review the failures above before starting the server.${NC}"
fi

echo
echo -e "  ${W}Next steps:${NC}"
echo -e "  ${C}1)${NC}  ${D}cd backend && npm run dev${NC}"
echo -e "  ${C}2)${NC}  ${D}cd frontend && npm run dev     (in a second terminal)${NC}"
echo -e "  ${C}3)${NC}  ${D}Open http://localhost:3000${NC}"
echo
if [[ "$AI_PKG" == "none" ]]; then
  echo -e "  ${Y}Reminder:${NC}  Make sure ${W}Ollama${NC} is running:  ${D}ollama serve${NC}"
  echo
fi
echo -e "  ${D}To re-run this wizard at any time:  bash setup.sh${NC}"
echo
