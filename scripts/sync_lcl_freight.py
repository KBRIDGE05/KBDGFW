#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, re, zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
XLSX=ROOT/'data'/'LCL FREIGHT.xlsx'
OUT=ROOT/'data'/'lcl-freight.json'
KST=ZoneInfo('Asia/Seoul')
REQ=['ASIA','CHINA','N.CHINA','S.CHINA','JAPAN','EUROPE','MEDSEA','AFRICA','S.AMERICA','N.AMERICA','MIDEAST','OCEANIA']
LABELS={'ASIA':'아시아','CHINA':'중국 주요항','N.CHINA':'중국 북부 내륙','S.CHINA':'중국 남부 내륙','JAPAN':'일본','EUROPE':'유럽','MEDSEA':'지중해·북아프리카','AFRICA':'아프리카','S.AMERICA':'중남미','N.AMERICA':'북미','MIDEAST':'중동','OCEANIA':'오세아니아·태평양'}
NOTE_RANGES={'ASIA':(62,66),'CHINA':(32,37),'N.CHINA':(78,81),'S.CHINA':(57,64),'JAPAN':(42,48),'EUROPE':(142,146),'MEDSEA':(55,57),'AFRICA':(69,69),'S.AMERICA':(145,154),'N.AMERICA':(72,76),'MIDEAST':(33,35),'OCEANIA':(40,40)}

def clean(v):
    if v is None:return ''
    if isinstance(v,float) and v.is_integer(): return str(int(v))
    return re.sub(r'[ \t]+',' ',str(v).replace('\r','').strip())
def key(v): return re.sub(r'\s+',' ',clean(v)).strip().casefold()
def fmt(v):
    if v is None or v=='': return '-'
    if isinstance(v,(int,float)): return str(int(v)) if float(v).is_integer() else str(v)
    return clean(v)
def first_num(v):
    s=clean(v).replace(',','')
    m=re.search(r'(?<![A-Za-z])([+-]?\d+(?:\.\d+)?)',s)
    return float(m.group(1)) if m else None
def basis_info(s):
    s=clean(s)
    weight=1000; mincbm=None
    m=re.search(r'(\d+(?:\.\d+)?)\s*KG\s*=\s*1\s*CBM',s,re.I)
    if m: weight=float(m.group(1))
    m=re.search(r'1\s*CBM\s*=\s*(\d+(?:\.\d+)?)\s*KGS?',s,re.I)
    if m: weight=float(m.group(1))
    m=re.search(r'^(\d+(?:\.\d+)?)\s*CBM$',s,re.I)
    if m: mincbm=float(m.group(1))
    return weight,mincbm
def dual(v):
    s=clean(v).replace(',','')
    m=re.search(r'(\d+(?:\.\d+)?)\s*/?\s*CBM.*?(?:OR|&).*?(\d+(?:\.\d+)?)\s*/?\s*(?:TON|WT)',s,re.I)
    return (float(m.group(1)),float(m.group(2))) if m else None
def status(rate):
    s=clean(rate).upper()
    if any(x in s for x in ['NO SERVICE','SUSPEND']): return 'unavailable'
    if 'ON REQUEST' in s: return 'on_request'
    if not s or s=='-': return 'inquiry'
    if dual(rate) or first_num(rate) is not None: return 'available'
    return 'inquiry'

def read_xlsx(path):
    with zipfile.ZipFile(path) as z:
        ns='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
        ss=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            root=ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall(ns+'si'):
                ss.append(''.join(t.text or '' for t in si.iter(ns+'t')))
        wb=ET.fromstring(z.read('xl/workbook.xml'))
        relroot=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        relns='{http://schemas.openxmlformats.org/package/2006/relationships}'
        rel={x.attrib['Id']:x.attrib['Target'] for x in relroot.findall(relns+'Relationship')}
        rns='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
        out={}
        def ci(s):
            n=0
            for ch in s:n=n*26+ord(ch)-64
            return n-1
        for sh in wb.find(ns+'sheets'):
            name=sh.attrib['name']; target=rel[sh.attrib[rns+'id']]
            target=('xl/'+target) if not target.startswith(('xl/','/')) else target.lstrip('/')
            root=ET.fromstring(z.read(target)); rows={}; maxr=0; maxc=0
            for rr in root.findall('.//'+ns+'sheetData/'+ns+'row'):
                rno=int(rr.attrib['r']); maxr=max(maxr,rno); d={}
                for c in rr.findall(ns+'c'):
                    col=ci(re.match(r'([A-Z]+)',c.attrib['r']).group(1)); maxc=max(maxc,col)
                    t=c.attrib.get('t'); v=c.find(ns+'v'); val=None
                    if t=='s' and v is not None: val=ss[int(v.text)]
                    elif t=='inlineStr':
                        node=c.find(ns+'is'); val=''.join(x.text or '' for x in node.iter(ns+'t')) if node is not None else ''
                    elif v is not None:
                        x=v.text
                        if t=='str':val=x
                        else:
                            try:
                                f=float(x); val=int(f) if f.is_integer() else f
                            except: val=x
                    d[col]=val
                rows[rno]=d
            out[name]=[[rows.get(r,{}).get(c) for c in range(maxc+1)] for r in range(1,maxr+1)]
        return out

def old_context():
    try:d=json.loads(OUT.read_text(encoding='utf-8'))
    except Exception:d={'countries':{},'regions':[]}
    trans={}
    for r in d.get('regions',[]):
        for e in r.get('entries',[]):
            if e.get('destinationKo'): trans[(r.get('id'),key(e.get('destination')))] = e['destinationKo']
    countries=d.get('countries',{})
    cmap={key(k):k for k in countries}
    return countries,cmap,trans
COUNTRIES,CMAP,TRANS=old_context()
def canon_country(v):
    v=re.sub(r'\s+',' ',clean(v))
    if not v:return ''
    return CMAP.get(key(v),v)

def make_entry(region, seq, country, dest, *, origin='Busan', section='', province='', collect='', frequency='', tt='', route='', mode='', tsfee='', remark='', rate=None, minrate=None, basis='', calc=None, tiers=None, force_weight=None, force_mincbm=None):
    country=canon_country(country); dest=clean(dest); rate_d=fmt(rate); min_d=fmt(minrate); basis=clean(basis)
    d=dual(rate); calc=calc or ('dual' if d else 'standard')
    w,mc=basis_info(basis)
    if force_weight is not None:w=force_weight
    if force_mincbm is not None:mc=force_mincbm
    if not basis and '1CBM=500KGS' in clean(rate).replace(' ','').upper(): w,mc=500,1
    st=status(rate)
    rv=first_num(rate) if st=='available' and not d and calc!='tiered' else None
    mv=first_num(minrate) if minrate not in (None,'') else None
    if calc=='tiered': st='available' if tiers else st
    ent={'id':f"{region.lower().replace('.','')}-{seq:04d}",'region':region,'regionLabel':LABELS[region],'origin':origin,'country':country,'destination':dest,'section':section,'province':clean(province),'collect':clean(collect),'frequency':clean(frequency),'transitTime':clean(tt),'route':clean(route) or 'Direct','mode':clean(mode),'tsFee':clean(tsfee),'remark':clean(remark),'tiers':tiers or [],'rateDisplay':rate_d,'minDisplay':min_d,'basisDisplay':basis,'rateValue':rv,'minValue':mv,'rateCbm':d[0] if d else None,'rateTon':d[1] if d else None,'weightKgPerCbm':w,'minimumCbm':mc,'calcType':calc,'status':st,'searchText':clean(f"{country} {dest} {section} {route}")}
    ko=TRANS.get((region,key(dest)))
    if ko:ent['destinationKo']=ko
    if country and country not in COUNTRIES: COUNTRIES[country]={'ko':country,'en':country}
    return ent

def notes(rows, lo, hi):
    out=[]
    for i in range(lo,hi+1):
        if i<=len(rows):
            s=clean(rows[i-1][0] if rows[i-1] else '')
            if s:out.append(s)
    return out

def parse(data):
    regions=[]; seq=1
    for rid in REQ:
        rows=data[rid]; ents=[]
        def add(*a,**kw):
            nonlocal seq
            ents.append(make_entry(rid,seq,*a,**kw)); seq+=1
        if rid=='ASIA':
            country=''
            for i in range(10,61):
                r=rows[i-1]+[None]*8
                if r[0] not in (None,''): country=r[0]
                if not clean(r[1]):continue
                dest=clean(r[1]); origin='Busan'
                m=re.match(r'(?i)(busan|ince?hon|incheon)\s*-\s*(.+)',dest)
                if m: origin='Incheon' if m.group(1).lower()!='busan' else 'Busan'; dest=m.group(2)
                add(country,dest,origin=origin,section='Main Port',collect=r[4],frequency=r[5],tt=r[6],route=r[7],rate=r[2],minrate=r[3])
        elif rid=='CHINA':
            origin='Busan'
            for i in range(9,31):
                r=rows[i-1]+[None]*8
                if clean(r[0]): origin='Incheon' if 'incheon' in clean(r[0]).lower() else 'Busan'
                if clean(r[1]): add('China',r[1],origin=origin,section='Main Port',collect=r[4],frequency=r[5],tt=r[6],route=r[7],rate=r[2],minrate=r[3])
        elif rid=='N.CHINA':
            for lo,hi,section,basis in [(11,66,'Shanghai T/S','3CBM'),(70,76,'Xingang T/S','2.5CBM')]:
                for i in range(lo,hi+1):
                    r=rows[i-1]+[None]*6
                    if clean(r[0]): add('China',r[0],section=section,province=r[1],tt=r[5],route=section,rate=r[2],minrate=r[3],basis=r[4] or basis,force_weight=333)
        elif rid=='S.CHINA':
            province=''; i=10
            while i<=55:
                r=rows[i-1]+[None]*6
                if clean(r[0]): province=r[0]
                if not clean(r[1]): i+=1; continue
                dest=r[1]; tierrows=[r]; j=i+1
                while j<=55:
                    rr=rows[j-1]+[None]*6
                    if clean(rr[1]):break
                    if clean(rr[2]): tierrows.append(rr); j+=1
                    else: break
                if len(tierrows)>1:
                    tiers=[{'rate':first_num(x[2]),'basis':clean(x[3]),'frequency':clean(x[4]),'transitTime':clean(x[5])} for x in tierrows if first_num(x[2]) is not None]
                    add('China',dest,section='Hong Kong T/S',province=province,frequency=r[4],tt=r[5],route='Hong Kong',rate=r[2],basis=r[3],calc='tiered',tiers=tiers)
                    i=j; continue
                add('China',dest,section='Hong Kong T/S',province=province,frequency=r[4],tt=r[5],route='Hong Kong',rate=r[2],basis=r[3])
                i+=1
        elif rid=='JAPAN':
            for i in range(9,41):
                r=rows[i-1]+[None]*7
                if clean(r[0]): add('Japan',r[0],section='Main Port',collect=r[3],frequency=r[4],tt=r[5],route='Direct',remark=r[6],rate=r[1],minrate=r[2])
        elif rid=='EUROPE':
            for lo,hi,section in [(11,18,'Main Port'),(23,141,'Inland')]:
                country=''
                for i in range(lo,hi+1):
                    r=rows[i-1]+[None]*9
                    if clean(r[0]) and not clean(r[0]).startswith('*'): country=r[0]
                    if not clean(r[1]) or clean(r[1]).startswith('*'):continue
                    add(country,r[1],section=section,collect=r[4],frequency=r[5],tt=r[6],mode=r[7],route=r[8] or r[7],rate=r[2],minrate=r[3])
        elif rid=='MEDSEA':
            for lo,hi,section in [(9,11,'Main Port'),(16,53,'Inland')]:
                country=''
                for i in range(lo,hi+1):
                    r=rows[i-1]+[None]*8
                    if clean(r[0]):country=r[0]
                    if clean(r[1]):add(country,r[1],section=section,collect=r[4],frequency=r[5],tt=r[6],route=r[7],rate=r[2],minrate=r[3])
        elif rid=='AFRICA':
            remarkmap={key((rows[i-1]+[None]*2)[0]):clean((rows[i-1]+[None]*2)[1]) for i in range(73,min(111,len(rows))+1) if clean((rows[i-1]+[None]*2)[0])}
            country=''
            for i in range(10,69):
                r=rows[i-1]+[None]*8
                if clean(r[0]):country=r[0]
                if clean(r[1]):add(country,r[1],section='Main/Inland',frequency=r[4],tt=r[5],route=r[6],tsfee=r[7],remark=remarkmap.get(key(r[1]),''),rate=r[2],minrate=r[3])
        elif rid=='S.AMERICA':
            country=''
            for i in range(12,24):
                r=rows[i-1]+[None]*11
                if clean(r[0]):country=r[0]
                if clean(r[1]):add(country,r[1],section='Main Port',collect=r[4],frequency=r[5],tt=r[7],route=r[8],remark=r[9],rate=r[2],minrate=r[3])
            country=''
            for i in range(27,144):
                r=rows[i-1]+[None]*11
                if clean(r[0]):country=r[0]
                if clean(r[1]):
                    calc='add_on' if clean(r[2]).startswith('+') else None
                    add(country,r[1],section='Inland',collect=r[7],frequency=r[5],tt=r[6],route=r[8],remark=r[10] or r[9],rate=r[2],minrate=r[4],basis=r[3],calc=calc)
        elif rid=='N.AMERICA':
            section=''; country='USA'
            for i in range(10,25):
                r=rows[i-1]+[None]*14
                if clean(r[0]):
                    section=clean(r[0]); country='Canada' if section=='CANADA' else 'USA'
                if clean(r[1]): add(country,r[1],section=section,collect=r[8],frequency=r[7],tt=r[9],route=r[11],rate=r[3],minrate=r[5])
            for i in range(35,71):
                r=rows[i-1]+[None]*14
                for base in (0,7):
                    dest=clean(r[base]);
                    if not dest:continue
                    for label,off in [('LAX',1),('NYC',4)]:
                        rate=r[base+off]; tt=r[base+off+1]; mode=r[base+off+2]
                        add('USA',dest,section=f'Inland via {label}',tt=tt,route=label,mode=mode,rate=rate,basis='1CBM=363KGS',calc='add_on',force_weight=363,force_mincbm=1)
        elif rid=='MIDEAST':
            section=''; country=''
            for i in range(9,33):
                r=rows[i-1]+[None]*10
                if clean(r[0]):section=re.sub(r'\s+',' ',clean(r[0]))
                if clean(r[1]):country=r[1]
                if clean(r[2]):add(country,r[2],section=section,collect=r[5],frequency=r[6],tt=r[7],route=r[8],tsfee=r[9],rate=r[3],minrate=r[4])
        elif rid=='OCEANIA':
            for lo,hi,section in [(9,16,'Oceania'),(21,38,'Pacific Islands')]:
                country=''
                for i in range(lo,hi+1):
                    r=rows[i-1]+[None]*9
                    if clean(r[0]):country=r[0]
                    if clean(r[1]):add(country,r[1],section=section,collect=r[4],frequency=r[5],tt=r[6],route=r[7],remark=r[8] if section=='Oceania' else '',tsfee=r[8] if section!='Oceania' else '',rate=r[2],minrate=r[3])
        lo,hi=NOTE_RANGES[rid]
        regions.append({'id':rid,'label':LABELS[rid],'group':LABELS[rid],'notes':notes(rows,lo,hi),'entries':ents})
    return regions

def main():
    if not XLSX.exists():raise SystemExit(f'Missing {XLSX}')
    data=read_xlsx(XLSX)
    missing=[x for x in REQ if x not in data]
    if missing:raise SystemExit('Missing sheets: '+', '.join(missing))
    regions=parse(data)
    counts={r['id']:len(r['entries']) for r in regions}
    if sum(counts.values())<700:raise SystemExit(f'Unexpectedly low LCL entry count: {counts}')
    now=datetime.now(KST); period=now.strftime('%Y-%m'); y,m=map(int,period.split('-'))
    payload={'meta':{'period':period,'periodLabel':f'{y}년 {m}월','currency':'USD','basis':'LCL 해상 기본운임','periodBasis':'LCL FREIGHT.xlsx 업로드월(KST)','sourceFile':'data/LCL FREIGHT.xlsx','generatedAt':now.strftime('%Y-%m-%d'),'sourceSha256':hashlib.sha256(XLSX.read_bytes()).hexdigest(),'notice':'운임은 참고용이며 CFS, THC, DOC, ENS/AMS, 환적비, 도착지 비용, 통관·픽업비 및 특수화물 할증은 별도입니다.'},'countries':COUNTRIES,'regions':regions}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print('LCL synced:',payload['meta']['periodLabel'],counts,'total',sum(counts.values()))
if __name__=='__main__':main()
