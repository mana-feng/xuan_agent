/**
 * Encode chart JSON as TOON (comma delimiter, two-space indentation).
 * Tables contain primitive cells only; nested values keep their own structure.
 * Strings are consistently quoted so type-like text cannot change type on decode.
 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function quote(value: string): string {
  const escapes: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
  return `"${value.replace(/["\\\u0000-\u001f]/g, ch => escapes[ch] ?? `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;
}

function keyToken(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(key) ? key : quote(key);
}

function isPrimitive(value: JsonValue): boolean {
  return value === null || typeof value !== 'object';
}

function primitive(value: JsonValue): string {
  return typeof value === 'string' ? quote(value) : JSON.stringify(value);
}

function tableKeys(values: JsonValue[]): string[] | null {
  const first = values[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return null;
  const keys = Object.keys(first).sort();
  if (!keys.length) return null;
  const matches = values.every(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const ownKeys = Object.keys(value);
    return ownKeys.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key) && isPrimitive(value[key]));
  });
  return matches ? keys : null;
}

function objectLines(value: { [key: string]: JsonValue }, depth: number): string[] {
  const spaces = '  '.repeat(depth);
  return Object.entries(value).flatMap(([key, field]) => {
    const token = keyToken(key);
    if (Array.isArray(field)) return arrayLines(field, token, depth);
    if (field !== null && typeof field === 'object') {
      return [`${spaces}${token}:`, ...objectLines(field, depth + 1)];
    }
    return [`${spaces}${token}: ${primitive(field)}`];
  });
}

function arrayLines(values: JsonValue[], key: string, depth: number, listItem = false): string[] {
  const spaces = '  '.repeat(depth);
  if (!values.length) return [`${spaces}${key ? `${key}: []` : listItem ? '[0]:' : '[]'}`];
  const header = `${spaces}${key}[${values.length}]`;
  if (values.every(isPrimitive)) return [`${header}: ${values.map(primitive).join(',')}`];

  // A keyless table is only valid at the document root, not after a list hyphen.
  const keys = listItem ? null : tableKeys(values);
  if (keys) {
    return [
      `${header}{${keys.map(keyToken).join(',')}}:`,
      ...values.map(value => `${spaces}  ${keys.map(key => primitive((value as Record<string, JsonValue>)[key])).join(',')}`),
    ];
  }

  const lines = [`${header}:`];
  const itemSpaces = `${spaces}  `;
  for (const value of values) {
    if (isPrimitive(value)) {
      lines.push(`${itemSpaces}- ${primitive(value)}`);
    } else if (Array.isArray(value)) {
      const [first, ...rest] = arrayLines(value, '', depth + 1, true);
      lines.push(`${itemSpaces}- ${first.slice(itemSpaces.length)}`, ...rest);
    } else {
      const fields = objectLines(value as Record<string, JsonValue>, depth + 2);
      if (!fields.length) lines.push(`${itemSpaces}-`);
      else lines.push(`${itemSpaces}- ${fields[0].slice(itemSpaces.length + 2)}`, ...fields.slice(1));
    }
  }
  return lines;
}

export function encodeTOON(data: any, indent = 0): string {
  // Match the existing JSON payload contract: omit undefined object fields,
  // normalize array holes/non-finite numbers to null, and serialize Date values.
  const json = JSON.stringify(data);
  if (json === undefined) return '';
  const value: JsonValue = JSON.parse(json);
  if (Array.isArray(value)) return arrayLines(value, '', indent).join('\n');
  if (value !== null && typeof value === 'object') return objectLines(value, indent).join('\n');
  return primitive(value);
}
