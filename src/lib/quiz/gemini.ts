import { GoogleGenAI } from "@google/genai";

export function geminiCallModel(apiKey: string, model: string) {
  const ai = new GoogleGenAI({ apiKey });
  return async (prompt: string): Promise<string> => {
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 1 },
    });
    if (!res.text) throw new Error("empty model response");
    return res.text;
  };
}
