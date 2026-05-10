"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, X, Loader2, Sparkles, Braces, AlignLeft, Code2, Link2 } from "lucide-react";
import { createEntry } from "@/lib/actions/entries";
import { CATEGORY_CONFIG, type Category, type Difficulty } from "@/lib/types";

function beautifyJSON(text: string): string {
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let hasJsonBlock = false;

  const result = text.replace(jsonBlockRegex, (_, jsonContent) => {
    hasJsonBlock = true;
    try {
      const parsed = JSON.parse(jsonContent.trim());
      return "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
    } catch {
      return _;
    }
  });

  if (hasJsonBlock) return result;

  try {
    const parsed = JSON.parse(text.trim());
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

function beautifyCode(text: string): string {
  return text.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (_, lang, code) => {
    const lines = code.split("\n");
    const trimmedLines = lines.map((line: string) => {
      const content = line.replace(/\t/g, "  ");
      return content.trimEnd();
    });

    while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1] === "") {
      trimmedLines.pop();
    }
    while (trimmedLines.length > 0 && trimmedLines[0] === "") {
      trimmedLines.shift();
    }

    return "```" + lang + "\n" + trimmedLines.join("\n") + "\n```";
  });
}

function beautifyText(text: string): string {
  let result = text;

  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/[ \t]+$/gm, "");
  result = result.replace(/^\s+\n/, "");
  result = result.replace(/\n\s+$/, "\n");

  result = result.replace(/^(#+)([^ #])/gm, "$1 $2");
  result = result.replace(/^(-|\*|\d+\.)([^ ])/gm, "$1 $2");

  return result;
}

export default function NewEntryPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [subcategory, setSubcategory] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const subcategories = category ? CATEGORY_CONFIG[category].subcategories : [];

  const insertLink = () => {
    const textarea = contentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    const linkText = selectedText || "link text";
    const markdown = `[${linkText}](https://)`;

    const newContent = content.substring(0, start) + markdown + content.substring(end);
    setContent(newContent);

    requestAnimationFrame(() => {
      textarea.focus();
      const urlStart = start + linkText.length + 3;
      const urlEnd = urlStart + 8;
      textarea.setSelectionRange(urlStart, urlEnd);
    });
  };

  const handleCategoryChange = (v: string | null) => {
    setCategory((v ?? "") as Category | "");
    setSubcategory("");
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim().toLowerCase())) {
        setTags([...tags, tagInput.trim().toLowerCase()]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSave = async () => {
    if (!title || !category || !content) return;

    setSaving(true);
    setError(null);

    try {
      const entry = await createEntry({
        title,
        content,
        category: category as Category,
        subcategory: subcategory || undefined,
        tags,
        difficulty: (difficulty as Difficulty) || "medium",
      });
      router.push(`/entries/${entry.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entry");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <LinkButton href="/entries" variant="ghost" size="icon">
          <ArrowLeft className="h-5 w-5" />
        </LinkButton>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">New Entry</h1>
          <p className="text-muted-foreground">
            Capture what you learned today.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!title || !category || !content || saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Title</label>
              <Input
                placeholder="e.g., Binary Search - Finding Target in Sorted Array"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Category
                </label>
                <Select value={category} onValueChange={handleCategoryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Subcategory
                </label>
                <Select
                  value={subcategory}
                  onValueChange={(v) => setSubcategory(v ?? "")}
                  disabled={!category}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={category ? "Select subcategory" : "Pick a category first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {subcategories.map((sub) => (
                      <SelectItem key={sub} value={sub}>
                        {sub}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Difficulty
              </label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty((v ?? "") as Difficulty | "")}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Tags</label>
              <Input
                placeholder="Type a tag and press Enter..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Content</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setContent(beautifyJSON(content))}
                title="Format JSON"
                disabled={!content.trim()}
              >
                <Braces className="h-4 w-4 mr-1" />
                <span className="text-xs">JSON</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setContent(beautifyCode(content))}
                title="Clean up code blocks"
                disabled={!content.trim()}
              >
                <Code2 className="h-4 w-4 mr-1" />
                <span className="text-xs">Code</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setContent(beautifyText(content))}
                title="Clean up whitespace and formatting"
                disabled={!content.trim()}
              >
                <AlignLeft className="h-4 w-4 mr-1" />
                <span className="text-xs">Text</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={insertLink}
                title="Insert a link"
              >
                <Link2 className="h-4 w-4 mr-1" />
                <span className="text-xs">Link</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setContent(beautifyText(beautifyCode(beautifyJSON(content))))}
                title="Format everything"
                disabled={!content.trim()}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                <span className="text-xs">All</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              ref={contentRef}
              placeholder="Write your notes here... (Markdown supported)&#10;&#10;## Algorithm&#10;1. Step one&#10;2. Step two&#10;&#10;```python&#10;def solution():&#10;    pass&#10;```&#10;&#10;**Time Complexity:** O(n)&#10;**Space Complexity:** O(1)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Tip: Use Markdown for formatting. Use the buttons above to beautify JSON, code blocks, or text.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
