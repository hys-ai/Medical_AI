# -*- coding: utf-8 -*-
"""Minimal pure-stdlib PDF text extractor (page -> text), for page-cited RAG prototypes.

No third-party deps: parses objects (incl. object streams), fonts, ToUnicode CMaps,
and content streams. Good enough for text books produced by mainstream typesetters.
"""
import re, sys, zlib, json, io

WS = b"\x00\t\n\f\r "
DELIM = b"()<>[]{}/%"

class Parser:
    def __init__(self, data, pos=0):
        self.d = data
        self.i = pos

    def skip(self):
        d, n = self.d, len(self.d)
        while self.i < n:
            c = d[self.i:self.i + 1]
            if c in (b" ", b"\n", b"\r", b"\t", b"\f", b"\x00"):
                self.i += 1
            elif c == b"%":
                while self.i < n and d[self.i:self.i + 1] not in (b"\n", b"\r"):
                    self.i += 1
            else:
                break

    def parse(self):
        self.skip()
        d = self.d
        if self.i >= len(d):
            raise ValueError("eof")
        c = d[self.i:self.i + 1]
        if c == b"<":
            if d[self.i:self.i + 2] == b"<<":
                self.i += 2
                out = {}
                while True:
                    self.skip()
                    if d[self.i:self.i + 2] == b">>":
                        self.i += 2
                        return out
                    if d[self.i:self.i + 1] == b"/":
                        key = self.parse_name()
                        out[key] = self.parse()
                    else:
                        self.skip()
                        if d[self.i:self.i + 2] == b">>":
                            self.i += 2
                            return out
                        raise ValueError("bad dict at %d" % self.i)
            else:
                self.i += 1
                j = d.find(b">", self.i)
                hexs = re.sub(rb"[^0-9A-Fa-f]", b"", d[self.i:j])
                self.i = j + 1
                if len(hexs) % 2:
                    hexs += b"0"
                return bytes.fromhex(hexs.decode())
        if c == b"[":
            self.i += 1
            arr = []
            while True:
                self.skip()
                if d[self.i:self.i + 1] == b"]":
                    self.i += 1
                    return arr
                arr.append(self.parse())
        if c == b"/":
            return ("name", self.parse_name())
        if c == b"(":
            return self.parse_string()
        # number / ref / keyword
        m = re.match(rb"([+-]?\d*\.?\d+)", d[self.i:self.i + 40])
        if m:
            tok = m.group(1)
            self.i += len(tok)
            if b"." in tok:
                return float(tok)
            val = int(tok)
            save = self.i
            self.skip()
            m2 = re.match(rb"(\d+)\s+R\b", d[self.i:self.i + 30])
            if m2:
                self.i += m2.end()
                return ("ref", val, int(m2.group(1)))
            self.i = save
            return val
        m = re.match(rb"[A-Za-z*'\"]+", d[self.i:self.i + 20])
        if m:
            self.i += len(m.group(0))
            return ("kw", m.group(0).decode("latin-1"))
        self.i += 1
        return None

    def parse_name(self):
        self.i += 1
        m = re.match(rb"[^/%<>\[\]()\s]*", self.d[self.i:self.i + 200])
        raw = m.group(0)
        self.i += len(raw)
        return raw.decode("latin-1")

    def parse_string(self):
        d = self.d
        self.i += 1
        depth = 1
        out = bytearray()
        while self.i < len(d):
            c = d[self.i:self.i + 1]
            if c == b"\\":
                nxt = d[self.i + 1:self.i + 2]
                mp = {b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f",
                      b"(": b"(", b")": b")", b"\\": b"\\"}
                if nxt in mp:
                    out += mp[nxt]
                    self.i += 2
                elif nxt.isdigit():
                    m = re.match(rb"\\([0-7]{1,3})", d[self.i:self.i + 5])
                    if m:
                        out.append(int(m.group(1), 8) & 0xFF)
                        self.i += m.end()
                    else:
                        self.i += 1
                else:
                    self.i += 1
            elif c == b"(":
                depth += 1
                out += c
                self.i += 1
            elif c == b")":
                depth -= 1
                self.i += 1
                if depth == 0:
                    return bytes(out)
                out += c
            else:
                out += c
                self.i += 1
        return bytes(out)


def png_unfilter(data, parms):
    try:
        pred = int(parms.get("Predictor", 1))
    except Exception:
        pred = 1
    if pred < 2:
        return data
    cols = int(parms.get("Columns", 1))
    colors = int(parms.get("Colors", 1))
    bpc = int(parms.get("BitsPerComponent", 8))
    bpp = max(1, colors * bpc // 8)
    rowlen = cols * colors * bpc // 8
    out = bytearray()
    prev = bytearray(rowlen)
    i = 0
    while i + rowlen + 1 <= len(data):
        ft = data[i]
        row = bytearray(data[i + 1:i + 1 + rowlen])
        i += rowlen + 1
        for j in range(rowlen):
            a = row[j - bpp] if j >= bpp else 0
            b = prev[j]
            c = prev[j - bpp] if j >= bpp else 0
            if ft == 1:
                row[j] = (row[j] + a) & 0xFF
            elif ft == 2:
                row[j] = (row[j] + b) & 0xFF
            elif ft == 3:
                row[j] = (row[j] + (a + b) // 2) & 0xFF
            elif ft == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                row[j] = (row[j] + pr) & 0xFF
        out += row
        prev = row
    return bytes(out)


class PDF:
    def __init__(self, data):
        self.d = data
        self.objs = {}
        self._load_objects()

    def _load_objects(self):
        d = self.d
        for m in re.finditer(rb"(?<![0-9])(\d+)\s+(\d+)\s+obj\b", d):
            num = int(m.group(1))
            start = m.end()
            p = start
            stream_start = None
            while True:
                s = d.find(b"stream", p)
                e = d.find(b"endobj", p)
                if e < 0:
                    break
                if 0 <= s < e:
                    stream_start = s
                break
            if stream_start is None:
                body = d[start:e]
                try:
                    self.objs[num] = (Parser(d, start).parse(), None)
                except Exception:
                    self.objs[num] = (None, None)
                continue
            head = d[start:stream_start]
            p2 = stream_start + 6
            if d[p2:p2 + 2] == b"\r\n":
                p2 += 2
            elif d[p2:p2 + 1] in (b"\n", b"\r"):
                p2 += 1
            e2 = d.find(b"endstream", p2)
            raw = d[p2:e2] if e2 > 0 else b""
            try:
                dobj = Parser(d, start).parse()
            except Exception:
                dobj = None
            self.objs[num] = (dobj, raw)
        # expand object streams
        for num, (dobj, raw) in list(self.objs.items()):
            if not isinstance(dobj, dict) or dobj.get("Type") != ("name", "ObjStm"):
                continue
            try:
                data = self.stream_of(num)
                if not data:
                    continue
                n = int(dobj.get("N", 0))
                first = int(dobj.get("First", 0))
                header = data[:first].split()
                for k in range(n):
                    onum = int(header[2 * k])
                    off = int(header[2 * k + 1])
                    start = first + off
                    end = first + int(header[2 * (k + 1) + 1]) if k + 1 < n else len(data)
                    if onum not in self.objs:
                        try:
                            self.objs[onum] = (Parser(data, start).parse(), None)
                        except Exception:
                            pass
            except Exception:
                continue

    def stream_of(self, num):
        dobj, raw = self.objs.get(num, (None, None))
        if raw is None or not isinstance(dobj, dict):
            return None
        filt = dobj.get("Filter")
        filt = filt[0] if isinstance(filt, list) else filt
        data = raw
        if filt and filt[0] == "name" and filt[1] == "FlateDecode":
            try:
                data = zlib.decompress(data)
            except Exception:
                try:
                    data = zlib.decompressobj().decompress(data)
                except Exception:
                    return None
            parms = dobj.get("DecodeParms")
            if isinstance(parms, dict):
                data = png_unfilter(data, {k: v for k, v in parms.items()})
        return data

    def resolve(self, v):
        seen = 0
        while isinstance(v, tuple) and len(v) == 3 and v[0] == "ref" and seen < 32:
            v = self.objs.get(v[1], (None, None))[0]
            seen += 1
        return v

    def root(self):
        for m in re.finditer(rb"/Root\s+(\d+)\s+(\d+)\s+R", self.d):
            return int(m.group(1))
        for num, (dobj, _) in self.objs.items():
            if isinstance(dobj, dict) and dobj.get("Type") == ("name", "Catalog"):
                return num
        return None

    def pages(self):
        out = []
        r = self.root()
        cat = self.resolve(("ref", r, 0)) if r else None
        if not isinstance(cat, dict):
            return out

        def walk(node_ref, depth=0):
            if depth > 64 or len(out) > 5000:
                return
            node = self.resolve(node_ref)
            if not isinstance(node, dict):
                return
            t = node.get("Type")
            kids = self.resolve(node.get("Kids"))
            if isinstance(kids, list):
                for k in kids:
                    walk(k, depth + 1)
            elif t == ("name", "Page") or "Contents" in node:
                out.append(node_ref[1] if isinstance(node_ref, tuple) else None)

        walk(cat.get("Pages"))
        return out

    def page_fonts(self, page):
        fonts = {}
        res = self.resolve(page.get("Resources"))
        if not isinstance(res, dict):
            return fonts
        fd = self.resolve(res.get("Font"))
        if not isinstance(fd, dict):
            return fonts
        for name, ref in fd.items():
            fonts.update(self._font_entry(name, ref))
        return fonts

    def _refs(self, v):
        if isinstance(v, tuple) and len(v) == 3 and v[0] == "ref":
            return [v]
        if isinstance(v, list):
            return [r for r in v if isinstance(r, tuple) and len(r) == 3 and r[0] == "ref"]
        return []

    def page_text(self, pagenum):
        page = self.resolve(("ref", pagenum, 0))
        if not isinstance(page, dict):
            return ""
        fonts = self.page_fonts(page)
        chunks = []
        for ref in self._refs(page.get("Contents")):
            data = self.stream_of(ref[1])
            if data:
                chunks.append(data)
        if not chunks:
            return ""
        return extract_text(b"\n".join(chunks), fonts, self, page.get("Resources"))

    def form_text(self, xobj_ref, depth):
        if depth > 6:
            return ""
        xo = self.resolve(xobj_ref)
        if not isinstance(xo, dict) or xo.get("Subtype") != ("name", "Form"):
            return ""
        data = self.stream_of(xobj_ref[1])
        if not data:
            return ""
        fonts = {}
        res = self.resolve(xo.get("Resources"))
        if isinstance(res, dict):
            fd = self.resolve(res.get("Font"))
            if isinstance(fd, dict):
                for name, ref in fd.items():
                    fonts.update(self._font_entry(name, ref))
        return extract_text(data, fonts, self, xo.get("Resources"), depth + 1)

    def _font_entry(self, name, ref):
        fo = self.resolve(ref)
        if not isinstance(fo, dict):
            return {}
        cmap = {}
        tu = fo.get("ToUnicode")
        if tu:
            data = self.stream_of(tu[1])
            if data:
                cmap.update(parse_cmap(data))
        elif fo.get("Subtype") == ("name", "Type0"):
            dfs = self.resolve(fo.get("DescendantFonts"))
            if isinstance(dfs, list) and dfs:
                df = self.resolve(dfs[0])
                if isinstance(df, dict) and df.get("ToUnicode"):
                    data = self.stream_of(df["ToUnicode"][1])
                    if data:
                        cmap.update(parse_cmap(data))
        two_byte = (fo.get("Subtype") == ("name", "Type0"))
        return {name: (cmap, two_byte)}


def parse_cmap(data):
    cmap = {}
    txt = data.decode("latin-1", "ignore")
    for m in re.finditer(r"beginbfchar(.*?)endbfchar", txt, re.S):
        body = m.group(1)
        for mm in re.finditer(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", body):
            src = int(mm.group(1), 16)
            dst = mm.group(2)
            cmap[src] = hexstr_to_unicode(dst)
    for m in re.finditer(r"beginbfrange(.*?)endbfrange", txt, re.S):
        body = m.group(1)
        for mm in re.finditer(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[(.*?)\])", body, re.S):
            lo = int(mm.group(1), 16)
            hi = int(mm.group(2), 16)
            if mm.group(4) is not None:
                base = hexstr_to_unicode(mm.group(4))
                if not base:
                    continue
                for off in range(0, min(hi - lo + 1, 65536)):
                    cmap[lo + off] = chr(ord(base[0]) + off) if base else ""
            else:
                items = re.findall(r"<([0-9A-Fa-f]+)>", mm.group(5))
                for k, it in enumerate(items):
                    if lo + k <= hi:
                        cmap[lo + k] = hexstr_to_unicode(it)
    return cmap


def hexstr_to_unicode(h):
    if isinstance(h, bytes):
        h = h.decode("latin-1")
    if len(h) % 4 != 0 and len(h) % 2 != 0:
        return ""
    try:
        b = bytes.fromhex(h)
    except ValueError:
        return ""
    if len(b) == 2:
        return b.decode("utf-16-be", "ignore")
    return b.decode("utf-16-be", "ignore")


def decode_str(raw, font):
    cmap, two_byte = font if font else ({}, True)
    out = []
    if two_byte or not cmap:
        # try 2-byte codes first
        for i in range(0, len(raw) - 1, 2):
            code = raw[i] << 8 | raw[i + 1]
            if code in cmap:
                out.append(cmap[code])
            elif not two_byte:
                ch = raw[i:i + 1]
                out.append(ch.decode("latin-1", "ignore"))
        if out:
            return "".join(out)
    for b in raw:
        if b in cmap:
            out.append(cmap[b])
        else:
            out.append(chr(b) if 32 <= b < 127 else "")
    return "".join(out)


def extract_text(content, fonts, pdf=None, resources=None, depth=0):
    p = Parser(content, 0)
    cur = None
    parts = []
    stack = []
    xobjs = None
    if pdf is not None and depth < 6:
        res = pdf.resolve(resources) if resources is not None else None
        if isinstance(res, dict):
            xobjs = pdf.resolve(res.get("XObject"))
            if not isinstance(xobjs, dict):
                xobjs = None

    def flushstr(s):
        nonlocal parts
        if s:
            parts.append(s)

    while True:
        try:
            tok = p.parse()
        except Exception:
            break
        if tok is None:
            p.i += 1
            if p.i >= len(content):
                break
            continue
        if isinstance(tok, tuple) and tok[0] == "kw":
            op = tok[1]
            if op == "Tf" and len(stack) >= 2:
                nm = stack[-2]
                if isinstance(nm, tuple) and nm[0] == "name":
                    cur = fonts.get(nm[1])
            elif op in ("Tj", "'", '"'):
                for a in reversed(stack):
                    if isinstance(a, (bytes, bytearray)):
                        flushstr(decode_str(bytes(a), cur))
                        break
                if op in ("'", '"'):
                    parts.append("\n")
            elif op == "TJ":
                for a in reversed(stack):
                    if isinstance(a, list):
                        for item in a:
                            if isinstance(item, (bytes, bytearray)):
                                flushstr(decode_str(bytes(item), cur))
                            elif isinstance(item, (int, float)) and item < -180:
                                parts.append(" ")
                        break
            elif op == "Do" and xobjs is not None:
                for a in reversed(stack):
                    if isinstance(a, tuple) and a[0] == "name":
                        ref = xobjs.get(a[1])
                        if isinstance(ref, tuple) and ref[0] == "ref":
                            try:
                                parts.append(pdf.form_text(ref, depth))
                            except Exception:
                                pass
                        break
            elif op in ("Td", "TD", "T*"):
                parts.append("\n")
            elif op == "ET":
                parts.append("\n")
            stack = []
        else:
            stack.append(tok)
            if len(stack) > 12:
                stack = stack[-12:]
    txt = "".join(parts)
    txt = re.sub(r"[ \t]+", " ", txt)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    return txt.strip()


def main():
    path = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10 ** 9
    out_path = sys.argv[3] if len(sys.argv) > 3 else None
    data = open(path, "rb").read()
    pdf = PDF(data)
    pnums = pdf.pages()
    print("pages found:", len(pnums))
    recs = []
    for idx, pn in enumerate(pnums[:limit], 1):
        try:
            t = pdf.page_text(pn)
        except Exception as e:
            t = ""
        recs.append({"pdf_page": idx, "chars": len(t), "text": t})
    with io.open(out_path or "extract.jsonl", "w", encoding="utf-8") as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    nonempty = [r for r in recs if r["chars"] > 20]
    print("non-empty pages:", len(nonempty), "/", len(recs))
    if nonempty:
        print("avg chars:", sum(r["chars"] for r in nonempty) // len(nonempty))
        sample = nonempty[len(nonempty) // 2]
        print("--- page", sample["pdf_page"], "---")
        print(sample["text"][:400])


if __name__ == "__main__":
    main()
