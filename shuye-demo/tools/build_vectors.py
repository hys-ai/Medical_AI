# -*- coding: utf-8 -*-
"""一次性把段落块编码成向量，存 embeddings.npy + embedding_ids.json。

跑完后，即使演示当天 embedding 接口不可用，语义检索仍然可用（容灾设计）。

用法：
    set EMB_KEY=sk-xxx
    python tools/build_vectors.py
"""
import io
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shuye import config  # noqa: E402

BATCH = 10


def embed(texts):
    payload = json.dumps({
        "model": config.EMB_MODEL,
        "input": texts,
        "dimensions": 1024,
        "encoding_format": "float",
    }).encode()
    req = urllib.request.Request(
        config.EMB_BASE.rstrip("/") + "/embeddings", data=payload,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + config.EMB_KEY})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    return [d["embedding"] for d in data["data"]]


def main():
    if not config.EMB_KEY:
        print("未设置 EMB_KEY，无法构建向量。")
        return
    try:
        import numpy as np
    except ImportError:
        print("需要 numpy：pip install numpy")
        return

    rows = [json.loads(l) for l in io.open(os.path.join(config.ROOT, "chunks.jsonl"), encoding="utf-8")]
    vecs, ids = [], []
    t0 = time.time()
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        vecs.extend(embed([r["text"][:500] for r in batch]))
        ids.extend([i + k for k in range(len(batch))])
        if (i // BATCH) % 20 == 0:
            print("  %d/%d  %.1fs" % (i, len(rows), time.time() - t0))
        time.sleep(0.05)
    np.save(config.VECTOR_PATH, np.array(vecs, dtype="float32"))
    with io.open(os.path.join(config.ROOT, "embedding_ids.json"), "w", encoding="utf-8") as f:
        json.dump(ids, f)
    print("完成：%d 条向量 → %s（%.1fs）" % (len(vecs), config.VECTOR_PATH, time.time() - t0))


if __name__ == "__main__":
    main()
