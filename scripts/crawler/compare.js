export const STATUS_LABEL = {
  match: '一致',
  diff: '差异',
  'data-only': '仅data',
  'source-only': '仅源站',
  empty: '空',
};

export function compareFields(dataFm, sourceFields) {
  const keys = [...new Set([...Object.keys(dataFm), ...Object.keys(sourceFields)])];
  return keys.map((field) => {
    const data = dataFm[field];
    const source = sourceFields[field];
    let status;
    if (data !== undefined && data !== '' && source !== undefined && source !== '') {
      status = String(data) === String(source) ? 'match' : 'diff';
    } else if (data !== undefined && data !== '') {
      status = 'data-only';
    } else if (source !== undefined && source !== '') {
      status = 'source-only';
    } else {
      status = 'empty';
    }
    return { field, data: data === undefined ? '' : String(data), source: source === undefined ? '' : String(source), status };
  });
}

export function displayWidth(s) {
  return [...String(s)].reduce((a, c) => a + (c.codePointAt(0) > 0x2e7f ? 2 : 1), 0);
}

export function pad(s, n) {
  const str = String(s);
  return str + ' '.repeat(Math.max(1, n - displayWidth(str)));
}

export default compareFields;
