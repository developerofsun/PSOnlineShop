import { ColorPicker } from 'antd';

/**
 * Form-compatible (#RRGGBB) colour input. ColorPicker is not a Form-friendly control by itself:
 * it works with Color objects, while the API stores and validates plain hex strings.
 */
export default function ColorField({ value, onChange }: { value?: string; onChange?: (hex: string) => void }) {
  return (
    <ColorPicker
      showText
      format="hex"
      disabledAlpha
      value={/^#[0-9a-fA-F]{6}$/.test(value ?? '') ? value : '#ffffff'}
      onChangeComplete={(c) => onChange?.(c.toHexString())}
    />
  );
}
