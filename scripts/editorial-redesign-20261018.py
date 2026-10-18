#!/usr/bin/env python3
"""One-time editorial migration. Preserve sourced body copy, SEO, dates and URLs.

The per-article brief is intentionally hand-authored. It changes the reading
question, entry point and selected section order without inventing new data.
Rerunning the script is idempotent.
"""
from __future__ import annotations

import re
from pathlib import Path
from bs4 import BeautifulSoup
from html import escape

ROOT = Path(__file__).resolve().parents[1]
CSS = "../../../assets/css/pages/blog-editorial.css?v=20261018-editorial-r4"

# kind, kicker, question, reader-first answer, feature section, position
# position: start | after-overview | stay
PLANS = {
    "glossary/alliance": ("network", "선사 네트워크를 읽는 법", "해운동맹 이름이 바뀌면 내 선적도 달라질까요?", "동맹 명칭보다 실제 서비스 노선, 기항지, 환적 구조와 선사별 스케줄을 먼저 비교해야 합니다.", "structure", "start"),
    "glossary/amazon-fba-entry-guide": ("journey", "입점부터 재고 보충까지", "아마존 FBA는 상품을 보내기 전 무엇부터 결정해야 할까요?", "판매 가능 품목과 수입 책임, 라벨 규격, 입고 절차를 한 흐름으로 검토하면 불필요한 재작업을 줄일 수 있습니다.", "process", "stay"),
    "glossary/azsl": ("dictionary", "셀러 용어 해석", "ASIN과 FNSKU를 혼동하면 어느 단계에서 문제가 생길까요?", "판매 상품의 식별코드와 실제 물류 라벨은 쓰이는 단계가 다릅니다. 입고 문서와 상품 표기를 함께 확인하세요.", "codes", "start"),
    "glossary/canal": ("route", "국제 운하와 우회 항로", "파나마 운하와 수에즈 운하 중 내 화물에 더 중요한 곳은 어디일까요?", "출발·도착 항만에 따라 영향받는 운하와 우회 경로가 달라집니다. 통과 조건보다 전체 항로와 운송기간을 먼저 보세요.", "compare", "start"),
    "glossary/coldchain": ("compliance", "온도조건부터 확인", "냉장·냉동 화물은 몇 도에 맞춰 보내야 안전할까요?", "모든 콜드체인 화물에 같은 온도 기준을 적용할 수 없습니다. 제품별 허용 범위와 일탈 관리 방식을 먼저 확인해야 합니다.", "temperature", "start"),
    "glossary/container": ("comparison", "규격 선택 가이드", "20FT와 40FT 중 어느 컨테이너를 선택해야 할까요?", "CBM만으로 결정하지 말고 내품 중량, 포장 크기, 적입 가능 여부와 반입 제한을 함께 비교해야 합니다.", "size", "start"),
    "glossary/csbs": ("comparison", "화물과 선박의 조합", "컨테이너선과 벌크선은 어떤 화물에서 갈릴까요?", "선박 선택은 화물의 포장 상태, 규격, 선적 방식에 따라 결정됩니다. 선종의 이름보다 실제 취급 조건이 중요합니다.", "difference", "stay"),
    "glossary/customs": ("compliance", "통관비용 구조", "수입신고 전에 관세가 어떻게 계산되는지 확인하셨나요?", "품목분류와 과세가격, 적용 관세율이 함께 세액을 좌우합니다. 통관 단계와 비용 계산을 구분해서 이해하세요.", "duty", "start"),
    "glossary/export": ("journey", "첫 수출 실무 순서", "처음 수출할 때 서류부터 만들면 될까요?", "거래조건과 화물·도착지 요건을 먼저 확인한 뒤 서류와 선적 일정을 역순으로 준비해야 누락을 줄일 수 있습니다.", "steps", "start"),
    "glossary/hscode": ("lookup", "품목분류 실제 조회", "HS CODE를 검색했는데 후보가 여러 개라면 어떻게 판단할까요?", "품명만으로 단정하지 말고 재질, 기능, 용도와 분류 근거를 대조해야 합니다. 애매하면 사전심사를 검토하세요.", "lookup", "start"),
    "glossary/index": ("market", "운임지수 해석", "운임지수 숫자 하나로 내 운임을 예측해도 될까요?", "SCFI·KCCI·BDI·항공운임지수는 항로와 화물 시장의 기준이 다릅니다. 실제 견적과 비교할 지수를 먼저 골라야 합니다.", "container", "start"),
    "glossary/lgsys": ("systems", "물류정보시스템 구조", "OMS·WMS·TMS·SCM은 무엇을 각각 관리할까요?", "주문·창고·운송·공급망은 서로 다른 데이터를 다루면서 연결됩니다. 우리 업무의 병목이 어느 단계인지 먼저 파악하세요.", "systems", "start"),
    "glossary/logisys": ("systems", "창고 자동화 설계", "랙부터 로봇까지 무엇을 먼저 도입해야 할까요?", "자동화 장비의 종류보다 입출고 물량, 화물 단위, 피킹 방식과 시스템 연동 조건을 먼저 정하는 것이 중요합니다.", "automation", "start"),

    "info/air-cw": ("calculation", "과금중량 바로 계산", "실제중량보다 항공운임이 높게 계산되는 이유는 무엇일까요?", "항공운임은 부피중량과 실제중량 중 적용 기준을 확인해야 합니다. 계산식과 박스 사례를 먼저 살펴보세요.", "formula", "start"),
    "info/ci": ("document", "인보이스 작성 실습", "커머셜 인보이스에 어떤 항목을 빠뜨리면 통관이 지연될까요?", "양식부터 열어 거래당사자·품명·수량·금액·거래조건을 점검하고 패킹리스트와 숫자가 일치하는지 확인하세요.", "download", "start"),
    "info/customs inspection": ("process", "검사 통지 대응", "수입화물 검사 통지를 받으면 무엇부터 확인해야 할까요?", "검사 주체와 유형을 구분한 뒤 서류·현품·작업비용과 예상 지연을 점검해야 대응 순서를 정할 수 있습니다.", "types", "start"),
    "info/delay": ("route", "ETA 지연 원인 추적", "선박 ETA가 계속 바뀌는데 어느 일정부터 믿어야 할까요?", "T/T 표기보다 전항 지연, 환적, 접안 상황과 실제 출항 여부를 같이 확인해야 합니다. 지연 원인을 먼저 구분해 보세요.", "reasons", "start"),
    "info/pi": ("document", "계약 전 서류 준비", "프로포마 인보이스는 언제 발행하고 무엇을 기재해야 할까요?", "확정 상업송장과 역할이 다르므로 견적·결제 조건을 먼저 맞추고 발행 목적에 맞춰 서류를 작성하세요.", "download", "start"),
    "info/pl": ("document", "포장 단위 검증", "패킹리스트를 작성할 때 가장 자주 빠지는 정보는 무엇일까요?", "포장별 수량, 순중량·총중량, 외포장 크기를 실제 적입 상태와 맞춰야 현장 반입과 통관 오류를 줄일 수 있습니다.", "download", "start"),
    "info/vf": ("lookup", "선박 위치 조회 실습", "선박 위치와 내 컨테이너 위치는 같은 정보일까요?", "선박 AIS는 항해 위치를 보여주지만 컨테이너 반출·양하는 별도 확인이 필요합니다. 조회 절차와 식별번호부터 확인하세요.", "howto", "start"),
    "info/wharfage": ("compliance", "세금계산서 대조", "Wharfage가 청구서 비고란에 따로 표시된 이유는 무엇일까요?", "부두사용료의 과세 처리와 다른 터미널 비용을 혼동하지 말고, 청구 항목·증빙 근거·세금계산서 반영 방식을 나눠 보세요.", "why", "start"),

    "insight/arctic": ("analysis", "북극항로 현실 점검", "북극항로가 수에즈항로를 곧 대체할 수 있을까요?", "항해거리만으로 판단하기 어렵습니다. 계절성, 쇄빙·보험·운항 안정성과 실제 선사 서비스 조건까지 함께 봐야 합니다.", "limits", "start"),
    "insight/asia-port-congestion": ("analysis", "항만 적체와 납기", "항만 혼잡이 장기화될 때 선적 기업은 무엇을 바꿔야 할까요?", "터미널 체선뿐 아니라 환적과 선복 회복 속도를 함께 봐야 합니다. 대체 항로와 출고일의 여유를 검토하세요.", "action", "start"),
    "insight/cuimport": ("analysis", "성수기 선적 시점", "조기 선적이 운임 상승을 의미할까요, 수요 변화 신호일까요?", "선복 예약과 소비 수요를 구분해야 합니다. 조기 발주가 총물류비와 재고 부담에 주는 영향을 먼저 계산해 보세요.", "action", "start"),
    "insight/duty": ("compliance", "예상보다 높은 관세", "견적과 실제 납부세액이 달라지는 지점은 어디일까요?", "과세가격에 포함되는 운임·보험·로열티 등의 조건을 거래서류 단계에서 확인해야 합니다. 신고 전 검토 항목부터 점검하세요.", "checklist", "start"),
    "insight/redsea": ("analysis", "해상 항로 리스크", "홍해 불안이 곧바로 납기와 총비용에 영향을 줄까요?", "운임 변동만 보지 말고 우회 항로, 보험 조건과 실제 선박 운항 가능 여부를 함께 점검해야 합니다.", "impact", "start"),

    "service/ess-import-logistics-gimcheon": ("case", "ESS 프로젝트 현장", "ESS 수입에서 선적보다 더 어려운 구간은 어디였을까요?", "위험물 검토, 중량물 내륙운송, 야간 작업과 최종 현장 반입 조건을 한 흐름으로 검토한 수행 사례입니다.", "case", "start"),
    "service/heavy": ("case", "중장비 수출 현장", "Flat Rack 선적에서 실제 현장 확인이 필요한 순간은 언제일까요?", "장비 치수·중량뿐 아니라 돌출부, 무게 중심과 고박 계획을 현장 사진과 작업 순서로 확인합니다.", "scene", "start"),
    "service/pipe": ("case", "장척 철강재 작업", "강관·형강 선적에서 가장 먼저 검토해야 할 조건은 무엇일까요?", "총중량만으로는 부족합니다. 가장 긴 화물, 작업 동선, 하역 장비와 쇼링 방법을 함께 설계해야 합니다.", "process", "start"),
    "service/solar": ("systems", "패널 보관·납품 운영", "태양광 패널 수입 후 여러 현장에 나눠 납품하려면 무엇이 필요할까요?", "컨테이너 적출부터 재고관리, 현장별 소분·배차까지 연결해야 재고와 출고 오류를 줄일 수 있습니다.", "flash", "start"),

    "news/28wnews": ("briefing", "28주차 / 운임 변동", "운임 상승 국면에서 무엇을 먼저 확인해야 할까요?", "해상운임, 항공 스페이스와 통관 변수를 따로 보지 말고 실제 선적 일정과 총비용으로 연결해 확인합니다.", "ocean", "after-overview"),
    "news/29news": ("briefing", "29주차 / 항공·수출", "수출 물동량 확대가 운송 조건에 어떤 차이를 만들까요?", "해상운임 안정과 항공 수요는 서로 다르게 움직입니다. 화물 특성에 따라 예약 전략을 나눠야 합니다.", "air", "after-overview"),
    "news/30news": ("briefing", "30주차 / 관세·통상", "관세 변화가 수출 물류비에 미치는 영향은 무엇일까요?", "운송비만이 아니라 세율과 원산지, 거래조건이 총원가를 바꿉니다. 통상 이슈를 먼저 확인하세요.", "customs", "after-overview"),
    "news/31news": ("briefing", "31주차 / 공급망", "운임 하락 신호와 공급망 리스크가 동시에 나타나면 어떻게 볼까요?", "가격 지표와 원자재·에너지 공급 리스크는 별도로 검토해야 합니다. 납기 여유를 점검하세요.", "supply", "after-overview"),
    "news/32news": ("briefing", "32주차 / 항공 할증", "항공 유류할증료 변경은 언제부터 견적에 반영될까요?", "기본운임과 할증료 적용 시점을 함께 확인해야 실제 항공 총운임을 비교할 수 있습니다.", "air", "after-overview"),
    "news/33news": ("briefing", "33주차 / EU 규정", "포장규정 변화가 수출 준비에 영향을 주는 시점은 언제일까요?", "EU 관련 요구사항은 운송 자체보다 포장·서류 준비 단계에서 먼저 검토해야 합니다.", "customs", "after-overview"),
    "news/34news": ("briefing", "34주차 / 해상 항로", "항로 변수와 운임지수가 달라질 때 어느 쪽을 더 봐야 할까요?", "운임수준과 실제 통항·기항 가능 여부를 구분해야 화물의 납기 위험을 판단할 수 있습니다.", "ocean", "after-overview"),
    "news/35news": ("briefing", "35주차 / 통상 규제", "해외 품목별 규제 이슈는 견적 전에 확인해야 할까요?", "세율과 규제 적용 범위가 달라질 수 있으므로 선적 준비와 원산지 증빙을 함께 점검해야 합니다.", "customs", "after-overview"),
    "news/36news": ("briefing", "36주차 / 운하 제한", "운하 제한이 선박 스케줄을 바꾼다면 무엇을 조정해야 할까요?", "실제 항로와 환적 일정, 예약 마감과 도착 예상일을 함께 재확인하는 것이 중요합니다.", "ocean", "after-overview"),
    "news/37news": ("briefing", "37주차 / 해상 정시성", "운임 상승과 항만 혼잡이 겹치면 납기를 어떻게 관리해야 할까요?", "운임지수보다 선사별 서비스와 환적 가능성, 수출입 일정의 완충 기간을 먼저 확인하세요.", "ocean", "after-overview"),
    "news/38news": ("briefing", "38주차 / 관세 제도", "해상 변수보다 통상 규정이 더 큰 비용 요인이 될 수 있을까요?", "품목별 관세와 EU 규제 적용 여부를 운송 방식과 함께 검토해야 합니다.", "trade", "after-overview"),
    "news/39news": ("briefing", "39주차 / 한국 수출", "수출 증가와 해상운임 변화는 같은 방향으로 움직일까요?", "한국 수출입 실적과 항로별 운임은 별도 지표입니다. 품목과 선적구간별로 영향을 나눠 봅니다.", "export", "after-overview"),
    "news/40news": ("briefing", "40주차 / 골든위크", "중국 연휴 전후에 항공과 해상 예약을 어떻게 조정해야 할까요?", "운송수단별 마감일과 선복 변화, 통관 진행 가능일을 함께 확인해야 합니다.", "air", "after-overview"),
    "news/41news": ("briefing", "41주차 / 공급망 판단", "운임지수와 중동 공급망 변수가 동시에 바뀌면 무엇부터 확인할까요?", "한국발 운임과 항로·보험·원유 관련 변수를 분리한 뒤 실제 화물에 필요한 대응을 정리합니다.", "supply", "after-overview"),
}

OPENING = '''<section class="kb-editorial-lead kb-editorial-{kind}" aria-labelledby="kb-editorial-heading">
<div class="kb-editorial-heading"><span class="kb-editorial-label">{label}</span><span class="kb-editorial-index">K-BRIDGE / FIELD NOTE</span></div>
<h2 id="kb-editorial-heading">{question}</h2>
<p class="kb-editorial-answer">{answer}</p>
<a class="kb-editorial-jump" href="#{focus}">이 글의 핵심 부분부터 살펴보기 <span aria-hidden="true">↗</span></a>
</section>'''


def section_span(source: str, section_id: str) -> tuple[int, int] | None:
    start_tag = next((tag for tag in re.finditer(r'<section\b[^>]*>', source)
                      if re.search(r'\bclass="[^"]*\bsection\b', tag.group(0))
                      and re.search(r'\bid="' + re.escape(section_id) + r'"', tag.group(0))), None)
    if not start_tag:
        return None
    depth = 1
    for match in re.finditer(r'<(/?)section\b[^>]*>', source[start_tag.end():], re.I):
        depth += -1 if match.group(1) else 1
        if depth == 0:
            return start_tag.start(), start_tag.end() + match.end()
    raise ValueError(f"Unclosed section: {section_id}")


def reorder_toc(source: str) -> str:
    match = re.search(r'<nav\b[^>]*class="[^"]*\btoc\b[^"]*"[^>]*>[\s\S]*?</nav>', source)
    if not match:
        return source
    doc = BeautifulSoup(match.group(0), "html.parser")
    ol = doc.find("ol")
    if not ol:
        return source
    section_tags = [tag for tag in re.finditer(r'<section\b[^>]*>', source)
                    if re.search(r'\bclass="[^"]*\bsection\b', tag.group(0))
                    and re.search(r'\bid="[^"]+"', tag.group(0))]
    rank = {re.search(r'\bid="([^"]+)"', tag.group(0)).group(1):i
            for i,tag in enumerate(section_tags)}
    items = ol.find_all("li", recursive=False)
    if not items:
        return source
    def key(item, original):
        anchor = item.find("a", href=True)
        href = anchor.get("href", "") if anchor else ""
        return (rank.get(href[1:], 10000 + original), original)
    ordered = [v for i,v in sorted(enumerate(items), key=lambda pair: key(pair[1],pair[0]))]
    for item in items:
        item.extract()
    for item in ordered:
        ol.append(item)
    return source[:match.start()] + str(doc.nav) + source[match.end():]


def transform(path: Path, plan: tuple[str, ...], *, dry_run: bool = False) -> bool:
    kind, label, question, answer, focus, position = plan
    original = path.read_text("utf-8")
    if "kb-editorial-lead" in original:
        # Older runs may have the topic-led opener but not its visual subtopic.
        if 'data-kb-editorial-focus=' not in original:
            previous = f'data-kb-editorial-kind="{kind}"'
            if previous not in original:
                raise ValueError(f"Unrecognized editorial theme: {path}")
            original = original.replace(previous, previous + f' data-kb-editorial-focus="{focus}"', 1)
            if not dry_run:
                path.write_text(original, encoding="utf-8")
            return True
        return False
    if "noindex" in (re.search(r'<meta[^>]*name="robots"[^>]*>', original) or [""])[0].lower():
        raise ValueError(f"Not an indexable story: {path}")
    if not section_span(original, focus):
        raise ValueError(f"Missing priority section {focus}: {path}")

    # The main body and supporting figures keep their original factual copy.
    if position in {"start", "after-overview"}:
        span = section_span(original, focus)
        assert span is not None
        selected = original[span[0]:span[1]]
        without = original[:span[0]] + original[span[1]:]
        if position == "start":
            first = next((tag for tag in re.finditer(r'<section\b[^>]*>', without)
                          if re.search(r'\bclass="[^"]*\bsection\b', tag.group(0))
                          and re.search(r'\bid="[^"]+"', tag.group(0))), None)
            if not first:
                raise ValueError(f"Missing first section: {path}")
            insert_at = first.start()
        else:
            overview = section_span(without, "overview")
            if not overview:
                raise ValueError(f"Missing news overview: {path}")
            insert_at = overview[1]
        original = without[:insert_at] + "\n" + selected + "\n" + without[insert_at:]

    # Existing visible numbering no longer implies one mandatory section order.
    original = re.sub(r'(<section\b[^>]*class="[^"]*\bsection\b[^"]*"[^>]*>\s*<h2[^>]*>)\d+\.\s*', r'\1', original)
    original = reorder_toc(original)

    summary = re.search(r'<section\b[^>]*class="[^"]*\b(?:quick-summary|summary)\b[^"]*"[^>]*>', original)
    if not summary:
        raise ValueError(f"Missing article summary: {path}")
    lead = OPENING.format(kind=escape(kind), label=escape(label), question=escape(question),
                          answer=escape(answer), focus=escape(focus))
    original = original[:summary.start()] + lead + "\n" + original[summary.start():]
    original = original.replace('<body class="', f'<body data-kb-editorial-kind="{kind}" data-kb-editorial-focus="{focus}" class="kb-editorialized ', 1)
    if CSS not in original:
        original = original.replace("</head>", f'<link rel="stylesheet" href="{CSS}"/>\n</head>', 1)
    if "kb-editorialized" not in original or "kb-editorial-lead" not in original:
        raise ValueError(f"Editorial insertion failed: {path}")
    if not dry_run:
        path.write_text(original, encoding="utf-8")
    return True


def main():
    actual = {f"{p.parent.name}/{p.stem}" for p in (ROOT / "blog/posts").glob("*/*.html")
              if p.parent.name in {"news", "info", "insight", "service", "glossary"}
              and p.name != "index.html"}
    # glossary/index.html is an article, insight/index.html is a legacy redirect.
    actual.add("glossary/index")
    if set(PLANS) != actual:
        raise ValueError(f"Editorial coverage mismatch: missing={sorted(actual - set(PLANS))}, surplus={sorted(set(PLANS) - actual)}")
    # Validate every document and anchor before touching the first source file.
    for key, plan in PLANS.items():
        category, slug = key.split("/", 1)
        transform(ROOT / "blog/posts" / category / f"{slug}.html", plan, dry_run=True)
    changed = 0
    for key, plan in PLANS.items():
        category, slug = key.split("/", 1)
        changed += bool(transform(ROOT / "blog/posts" / category / f"{slug}.html", plan))
    print(f"EDITORIAL REDESIGN PASS: {len(PLANS)} mapped articles, {changed} newly updated")


if __name__ == "__main__":
    main()
