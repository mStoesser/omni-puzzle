import { IMAGE_LIMITS } from "../../core/images.ts";
import { LIMITS, choiceHash, correctChoices, emptyQuestion, textHash } from "./logic.ts";
import type { QuestionKind, QuizData, QuizQuestion } from "./logic.ts";

// Pure editor operations. Each returns the same object if nothing changes.

type Choice = QuizQuestion & { kind: "single" | "multi" };

export function setPassPercent(data: QuizData, value: number): QuizData {
  if (!Number.isFinite(value)) return data;
  const passPercent = Math.min(100, Math.max(1, Math.round(value)));
  return passPercent === data.passPercent ? data : { ...data, passPercent };
}

export function addQuestion(data: QuizData, kind: QuestionKind, id: string): QuizData {
  if (data.questions.length >= LIMITS.maxQuestions) return data;
  return { ...data, questions: [...data.questions, emptyQuestion(kind, id)] };
}

export function removeQuestion(data: QuizData, index: number): QuizData {
  if (!data.questions[index]) return data;
  return { ...data, questions: data.questions.filter((_, i) => i !== index) };
}

/** Moves a question up (delta -1) or down (+1). */
export function moveQuestion(data: QuizData, index: number, delta: number): QuizData {
  const target = index + delta;
  if (!data.questions[index] || !data.questions[target]) return data;
  const questions = [...data.questions];
  [questions[index], questions[target]] = [questions[target]!, questions[index]!];
  return { ...data, questions };
}

/** Changes the question kind; text and id stay, options survive between single and multiple choice. */
export function changeKind(data: QuizData, index: number, kind: QuestionKind): QuizData {
  return update(data, index, (q) => {
    if (q.kind === kind) return q;
    if ((kind === "single" || kind === "multi") && (q.kind === "single" || q.kind === "multi")) {
      // Choice hashes do not depend on the kind; a single correct option stays valid either way.
      const correct = correctChoices(q);
      const answer = kind === "multi" || correct?.length === 1 ? q.answer : "";
      return { ...q, kind, answer };
    }
    const fresh = emptyQuestion(kind, q.id, q.text);
    return q.image ? { ...fresh, image: q.image } : fresh;
  });
}

/** Sets the question's picture (keeping its alt text when replacing one), or removes it with null. */
export function setImage(data: QuizData, index: number, key: string | null): QuizData {
  return update(data, index, (q) => {
    if (key === null) {
      if (!q.image) return q;
      const { image: _, ...rest } = q;
      return rest as QuizQuestion;
    }
    return q.image?.key === key ? q : { ...q, image: { key, alt: q.image?.alt ?? "" } };
  });
}

export function setImageAlt(data: QuizData, index: number, alt: string): QuizData {
  return update(data, index, (q) =>
    !q.image || q.image.alt === alt ? q : { ...q, image: { ...q.image, alt: alt.slice(0, IMAGE_LIMITS.maxAlt) } },
  );
}

export function setQuestionText(data: QuizData, index: number, text: string): QuizData {
  return update(data, index, (q) => (q.text === text ? q : { ...q, text: text.slice(0, LIMITS.maxText) }));
}

// The answer refers to option indexes, so editing an option's text keeps it correct.
export function setOption(data: QuizData, index: number, option: number, text: string): QuizData {
  return updateChoice(data, index, (q) => {
    if (q.options[option] === undefined || q.options[option] === text) return q;
    return { ...q, options: q.options.map((o, i) => (i === option ? text.slice(0, LIMITS.maxOption) : o)) };
  });
}

export function addOption(data: QuizData, index: number): QuizData {
  return updateChoice(data, index, (q) => (q.options.length >= LIMITS.maxOptions ? q : { ...q, options: [...q.options, ""] }));
}

export function removeOption(data: QuizData, index: number, option: number): QuizData {
  return updateChoice(data, index, (q) => {
    if (q.options[option] === undefined) return q;
    const correct = (correctChoices(q) ?? []).filter((c) => c !== option).map((c) => (c > option ? c - 1 : c));
    return {
      ...q,
      options: q.options.filter((_, i) => i !== option),
      answer: correct.length > 0 ? choiceHash(q.id, correct) : "",
    };
  });
}

/** Single choice: marks this option as the correct one. Multiple choice: toggles it. */
export function toggleCorrect(data: QuizData, index: number, option: number): QuizData {
  return updateChoice(data, index, (q) => {
    if (q.options[option] === undefined) return q;
    const current = correctChoices(q) ?? [];
    const next =
      q.kind === "single"
        ? [option]
        : current.includes(option)
          ? current.filter((c) => c !== option)
          : [...current, option];
    const answer = next.length > 0 ? choiceHash(q.id, next) : "";
    return answer === q.answer ? q : { ...q, answer };
  });
}

/** Adds an accepted free-text answer; only its hash is stored. */
export function addTextAnswer(data: QuizData, index: number, text: string): QuizData {
  return update(data, index, (q) => {
    if (q.kind !== "text" || text.trim() === "" || q.answers.length >= LIMITS.maxAnswers) return q;
    const hash = textHash(q.id, text);
    return q.answers.includes(hash) ? q : { ...q, answers: [...q.answers, hash] };
  });
}

export function removeTextAnswer(data: QuizData, index: number, answer: number): QuizData {
  return update(data, index, (q) => {
    if (q.kind !== "text" || q.answers[answer] === undefined) return q;
    return { ...q, answers: q.answers.filter((_, i) => i !== answer) };
  });
}

/** Sets the correct value or the tolerance of a number question; invalid input changes nothing. */
export function setNumber(data: QuizData, index: number, field: "value" | "tolerance", value: number): QuizData {
  return update(data, index, (q) => {
    if (q.kind !== "number" || !Number.isFinite(value) || Math.abs(value) > LIMITS.maxNumber) return q;
    if (field === "tolerance" && value < 0) return q;
    return q[field] === value ? q : { ...q, [field]: value };
  });
}

function update(data: QuizData, index: number, change: (q: QuizQuestion) => QuizQuestion): QuizData {
  const question = data.questions[index];
  if (!question) return data;
  const next = change(question);
  return next === question ? data : { ...data, questions: data.questions.map((q, i) => (i === index ? next : q)) };
}

function updateChoice(data: QuizData, index: number, change: (q: Choice) => Choice): QuizData {
  return update(data, index, (q) => (q.kind === "single" || q.kind === "multi" ? change(q) : q));
}
