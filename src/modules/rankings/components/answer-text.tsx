import { answerParts } from '../rules'

/**
 * An answer as the model wrote it: paragraphs as plain text with their line breaks, fenced code
 * in a monospace block that scrolls sideways. Whatever markup a model writes stays text.
 */
export function AnswerText({ text, lang }: { text: string; lang: string }) {
  return (
    <div lang={lang} className="flex flex-col gap-3 text-ui wrap-anywhere">
      {answerParts(text).map((part, index) =>
        part.kind === 'code' ? (
          <pre key={index} className="overflow-x-auto rounded-thumb bg-surface p-3 font-mono text-meta wrap-normal whitespace-pre">
            <code>{part.text}</code>
          </pre>
        ) : (
          <p key={index} className="whitespace-pre-wrap">
            {part.text}
          </p>
        ),
      )}
    </div>
  )
}
