import { useEffect, useId, useState } from 'react';
import { parseLength } from '../../model/units';
import type { BareUnit } from '../../model/types';

interface Props {
  label: string;
  /** mm */
  value: number | null;
  bareUnit: BareUnit;
  onCommit: (mm: number | null) => void;
  allowEmpty?: boolean;
  disabled?: boolean;
  testId?: string;
}

/**
 * Length input. Accepts ft-in and metric. Shows the converted value while typing; commits on Enter or ✓.
 * Escape or leaving the field without committing restores the stored value.
 */
export function LengthField({ label, value, bareUnit, onCommit, allowEmpty, disabled, testId }: Props) {
  const id = useId();
  const shown = value === null ? '' : `${round1(value)}`;
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);

  const parsed = text.trim() === '' ? null : parseLength(text, bareUnit);
  const dirty = editing && text !== shown;
  const commit = () => {
    if (text.trim() === '' && allowEmpty) {
      onCommit(null);
      setEditing(false);
      return;
    }
    if (parsed?.ok) {
      onCommit(parsed.mm);
      setEditing(false);
    }
  };
  return (
    <label className="f" htmlFor={id}>
      {label} <span className="muted">(mm; ft-in accepted)</span>
      <span className="lenrow">
        <input
          id={id}
          data-testid={testId}
          value={text}
          disabled={disabled}
          onFocus={() => setEditing(true)}
          onChange={(e) => {
            setEditing(true);
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setText(shown);
              setEditing(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={() => {
            if (!dirty) setEditing(false);
          }}
        />
        {dirty && (
          <button type="button" className="ok-btn" onClick={commit} disabled={!(parsed?.ok || (allowEmpty && text.trim() === ''))} title="Accept">
            ✓
          </button>
        )}
      </span>
      {dirty && (
        <span className={`preview ${parsed && !parsed.ok ? 'bad' : ''}`} data-testid={testId ? `${testId}-preview` : undefined}>
          {parsed === null ? (allowEmpty ? 'Empty: clears the value' : 'Enter a length') : parsed.ok ? `${parsed.explain}. Press Enter to accept.` : parsed.error}
        </span>
      )}
    </label>
  );
}

const round1 = (v: number) => Math.round(v * 10) / 10;
