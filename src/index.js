/**
 * Parse unified diff input
 * see: http://www.gnu.org/software/diffutils/manual/diffutils.html#Unified-Format
 */
export default function (input) {
  if (!input) return [];
  if (input.match(/^\s+$/)) return [];

  const lines = input.split('\n');
  if (lines.length == 0) return [];

  const files = [];
  let file = null;
  let lnDel = 0;
  let lnAdd = 0;
  let position = 0;
  let current = null;

  function start(line) {
    const [from, to] = parseFile(line);
    file = {
      from,
      to,
      chunks: [],
      deletions: 0,
      additions: 0,
    };
    files.push(file);
    position = 0;
  }

  function restart() {
    if (!file || file.chunks.length) start();
  }

  function newFile() {
    restart();
    file.new = true;
    file.from = '/dev/null';
  }

  function deletedFile() {
    restart();
    file.deleted = true;
    file.to = '/dev/null';
  }

  function index(line) {
    restart();
    file.index = line.split(' ').slice(1);
  }

  function fromFile(line) {
    restart();
    file.from = parseFileFallback(line);
  }

  function toFile(line) {
    restart();
    file.to = parseFileFallback(line);
  }

  function chunk(line, match) {
    const [, oldStart, oldLines, newStart, newLines] = match.map(l => +(l || 0));
    lnDel = oldStart;
    lnAdd = newStart;
    current = {
      content: line,
      changes: [],
      oldStart,
      oldLines,
      newStart,
      newLines,
    };
    file.chunks.push(current);
    if (!position) position = 1;
  }

  function del(line) {
    current.changes.push({
      type: 'del',
      del: true,
      ln: lnDel++,
      position: position++,
      content: line,
    });
    file.deletions++;
  }

  function add(line) {
    current.changes.push({
      type: 'add',
      add: true,
      ln: lnAdd++,
      position: position++,
      content: line,
    });
    file.additions++;
  }

  const noeol = '\\ No newline at end of file';

  function normal(line) {
    if (!file) return;
    current.changes.push({
      type: 'normal',
      normal: true,
      ln1: line === noeol ? lnDel++ : undefined,
      ln2: line === noeol ? lnAdd++ : undefined,
      position: position++,
      content: line,
    });
  }

  const schema = [
    [/^\s+/, normal],
    [/^diff\s/, start],
    [/^new file mode \d+$/, newFile],
    [/^deleted file mode \d+$/, deletedFile],
    [/^index\s[\da-zA-Z]+\.\.[\da-zA-Z]+(\s(\d+))?$/, index],
    [/^---\s/, fromFile],
    [/^\+\+\+\s/, toFile],
    [/^@@\s+\-(\d+),?(\d+)?\s+\+(\d+),?(\d+)?\s@@/, chunk],
    [/^-/, del],
    [/^\+/, add],
  ];

  function parse(line) {
    return schema.some(p => {
      const [pattern, handler] = p;
      if (typeof handler !== 'function') {
        throw new Error(`${pattern} has no handler`);
      }
      const m = line.match(pattern);
      if (m) {
        handler(line, m);
        return true;
      }
      return false;
    });
  }

  lines.forEach(parse);
  return files;
}

function parseFile(s) {
  if (!s) return [];
  const fileNames = s.split(' ').slice(-2);
  return fileNames.map(f => f.replace(/^(a|b)\//, ''));
}

function parseFileFallback(s) {
  s = s.replace(/^\s*(\++|-+)/, '').trim();

  // ignore possible timestamp
  const t = (/\t.*|\d{4}-\d\d-\d\d\s\d\d:\d\d:\d\d(.\d+)?\s(\+|-)\d\d\d\d/).exec(s);
  if (t) s = s.substring(0, t.index).trim();

  // ignore git prefixes a/ or b/
  return s.match(/^(a|b)\//) ? s.substr(2) : s;
}
