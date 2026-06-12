const express  = require('express');
const multer   = require('multer');
const xlsx     = require('xlsx');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Pastas ──────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DB_FILE    = path.join(DATA_DIR, 'dados.json');
const USERS_FILE = path.join(DATA_DIR, 'usuarios.json');

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ── Helpers dados ────────────────────────────────────────────
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { propostas:[], cartoes:[], fictor:[], ipp:[], servidores:[], updatedAt:null, f1:'', f2:'', f3:'', f4:'', f5:'' }; }
}
function writeDB(obj) { fs.writeFileSync(DB_FILE, JSON.stringify(obj), 'utf8'); }

// ── Helpers usuários ─────────────────────────────────────────
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}
function writeUsers(arr) { fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2), 'utf8'); }

function hashPass(senha) {
  return crypto.createHash('sha256').update(senha + 'rc-convenios-salt').digest('hex');
}

function initAdmin() {
  const users = readUsers();
  if (!users.find(u => u.role === 'admin')) {
    users.push({
      id:       crypto.randomUUID(),
      nome:     'Administrador',
      login:    'admin',
      email:    'admin@rcconvenios.com',
      senha:    hashPass('1234'),
      role:     'admin',
      ativo:    true,
      criadoEm: new Date().toISOString(),
    });
    writeUsers(users);
    console.log('  👤  Admin criado — login: admin | senha: 1234');
  }
}
initAdmin();

// ── Helpers gerais ───────────────────────────────────────────
function norm(s) {
  return String(s||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[.\-\/]/g,'');
}
function cleanCNPJ(s) { return String(s||'').replace(/\D/g,''); }
function pNum(v) { const n=parseFloat(String(v).replace(/[^\d,.-]/g,'').replace(',','.')); return isNaN(n)?0:n; }

function parseSheet(buffer, name) {
  const ext = path.extname(name).toLowerCase();
  const wb  = ext==='.csv'
    ? xlsx.read(buffer.toString('utf8'), {type:'string'})
    : xlsx.read(buffer, {type:'buffer', cellFormula:false});
  return xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
}

function nomeConvP1(row) { return String(row['Nome do Convênio']||row['Nome do Convenio']||'').trim(); }
function nomesConvP2(row) {
  return [
    String(row['Convênio']||row['Convenio']||'').trim(),
    String(row['Razão social empregador']||row['Razao social empregador']||'').trim(),
  ].filter(Boolean);
}
function matchConvenio(q, row, slot) {
  const qn=norm(q); const qc=cleanCNPJ(q);
  if(slot===1) return norm(nomeConvP1(row)).includes(qn)||(qc.length>=8&&cleanCNPJ(row['CNPJ Convênio']||'').includes(qc));
  return nomesConvP2(row).some(n=>norm(n).includes(qn))||(qc.length>=8&&cleanCNPJ(row['CNPJ empregador']||'').includes(qc));
}

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════
app.post('/api/login', (req, res) => {
  const { login, senha } = req.body;
  if (!login || !senha) return res.status(400).json({ ok:false, msg:'Preencha todos os campos.' });
  const users = readUsers();
  const id = login.toLowerCase().trim();
  const user = users.find(u =>
    (u.login.toLowerCase()===id || u.email.toLowerCase()===id) &&
    u.senha === hashPass(senha)
  );
  if (!user)  return res.status(401).json({ ok:false, msg:'Usuário ou senha incorretos.' });
  if (!user.ativo) return res.status(403).json({ ok:false, msg:'Usuário inativo. Contate o administrador.' });
  res.json({ ok:true, role:user.role, nome:user.nome, id:user.id });
});

// ════════════════════════════════════════════════════════════
//  USUÁRIOS (só admin)
// ════════════════════════════════════════════════════════════
app.get('/api/usuarios', (req, res) => {
  const users = readUsers().map(u => ({
    id:u.id, nome:u.nome, login:u.login, email:u.email,
    role:u.role, ativo:u.ativo, criadoEm:u.criadoEm
  }));
  res.json({ ok:true, users });
});

app.post('/api/usuarios', (req, res) => {
  const { nome, login, email, senha, role } = req.body;
  if (!nome||!login||!email||!senha) return res.status(400).json({ ok:false, msg:'Preencha todos os campos.' });
  const users = readUsers();
  const loginLower = login.toLowerCase().trim();
  const emailLower = email.toLowerCase().trim();
  if (users.find(u=>u.login.toLowerCase()===loginLower))
    return res.status(409).json({ ok:false, msg:'Login já cadastrado.' });
  if (users.find(u=>u.email.toLowerCase()===emailLower))
    return res.status(409).json({ ok:false, msg:'E-mail já cadastrado.' });
  const newUser = {
    id:       crypto.randomUUID(),
    nome:     nome.trim(),
    login:    loginLower,
    email:    emailLower,
    senha:    hashPass(senha),
    role:     role==='admin'?'admin':'user',
    ativo:    true,
    criadoEm: new Date().toISOString(),
  };
  users.push(newUser);
  writeUsers(users);
  res.json({ ok:true, user:{ id:newUser.id, nome:newUser.nome, login:newUser.login, email:newUser.email, role:newUser.role, ativo:newUser.ativo, criadoEm:newUser.criadoEm }});
});

app.put('/api/usuarios/:id', (req, res) => {
  const users = readUsers();
  const idx   = users.findIndex(u=>u.id===req.params.id);
  if (idx===-1) return res.status(404).json({ ok:false, msg:'Usuário não encontrado.' });
  const { nome, email, senha, role, ativo } = req.body;
  if (nome)  users[idx].nome  = nome.trim();
  if (email) users[idx].email = email.toLowerCase().trim();
  if (senha) users[idx].senha = hashPass(senha);
  if (role)  users[idx].role  = role==='admin'?'admin':'user';
  if (ativo !== undefined) users[idx].ativo = Boolean(ativo);
  writeUsers(users);
  res.json({ ok:true });
});

app.delete('/api/usuarios/:id', (req, res) => {
  let users = readUsers();
  const user = users.find(u=>u.id===req.params.id);
  if (!user) return res.status(404).json({ ok:false, msg:'Usuário não encontrado.' });
  if (user.role==='admin' && users.filter(u=>u.role==='admin').length===1)
    return res.status(400).json({ ok:false, msg:'Não é possível remover o único administrador.' });
  users = users.filter(u=>u.id!==req.params.id);
  writeUsers(users);
  res.json({ ok:true });
});

// ════════════════════════════════════════════════════════════
//  STATUS
// ════════════════════════════════════════════════════════════
app.get('/api/status', (req, res) => {
  const db = readDB();
  res.json({
    hasPropostas: db.propostas.length>0,
    hasCartoes:   db.cartoes.length>0,
    hasFictor:    (db.fictor||[]).length>0,
    hasIPP:       (db.ipp||[]).length>0,
    hasServidores:(db.servidores||[]).length>0,
    countPropostas: db.propostas.length,
    countCartoes:   db.cartoes.length,
    countFictor:    (db.fictor||[]).length,
    countIPP:       (db.ipp||[]).length,
    countServidores:(db.servidores||[]).length,
    updatedAt: db.updatedAt,
    f1:db.f1, f2:db.f2, f3:db.f3||'', f4:db.f4||'', f5:db.f5||'',
  });
});

// ════════════════════════════════════════════════════════════
//  UPLOAD
// ════════════════════════════════════════════════════════════
app.post('/api/upload/:slot', upload.single('file'), (req, res) => {
  const slot = parseInt(req.params.slot);
  if (!req.file) return res.status(400).json({ ok:false, msg:'Nenhum arquivo.' });
  let rows;
  try { rows = parseSheet(req.file.buffer, req.file.originalname); }
  catch(e) { return res.status(400).json({ ok:false, msg:'Erro ao ler: '+e.message }); }
  if (!rows.length) return res.status(400).json({ ok:false, msg:'Planilha vazia.' });
  const db = readDB();
  if      (slot===1){ db.propostas=rows; db.f1=req.file.originalname; }
  else if (slot===2){ db.cartoes=rows;   db.f2=req.file.originalname; }
  else if (slot===3){ db.fictor=rows;    db.f3=req.file.originalname; }
  else if (slot===4){
    const ext=path.extname(req.file.originalname).toLowerCase();
    let wb4;
    try {
      wb4=ext==='.csv'
        ?xlsx.read(req.file.buffer.toString('utf8'),{type:'string'})
        :xlsx.read(req.file.buffer,{type:'buffer',cellFormula:false});
    } catch(e){ return res.status(400).json({ok:false,msg:'Erro IPP: '+e.message}); }
    const abaIPP=wb4.SheetNames.includes('Raio X Convênios')?'Raio X Convênios':wb4.SheetNames[0];
    rows=xlsx.utils.sheet_to_json(wb4.Sheets[abaIPP],{defval:''});
    db.ipp=rows; db.f4=req.file.originalname;
  }
  else if(slot===5){
    const ext5=path.extname(req.file.originalname).toLowerCase();
    let wb5;
    try{
      wb5=ext5==='.csv'
        ?xlsx.read(req.file.buffer.toString('utf8'),{type:'string'})
        :xlsx.read(req.file.buffer,{type:'buffer',cellFormula:false});
    }catch(e){return res.status(400).json({ok:false,msg:'Erro servidores: '+e.message});}
    const abaServ=wb5.SheetNames.includes('Planilha1')?'Planilha1':wb5.SheetNames[0];
    rows=xlsx.utils.sheet_to_json(wb5.Sheets[abaServ],{defval:''});
    db.servidores=rows; db.f5=req.file.originalname;
  }
  db.updatedAt=new Date().toISOString();
  writeDB(db);
  res.json({ ok:true, count:rows.length });
});

// ════════════════════════════════════════════════════════════
//  SUGESTÕES
// ════════════════════════════════════════════════════════════
app.get('/api/sugestoes', (req, res) => {
  const {q}=req.query;
  if(!q||q.trim().length<2) return res.json({ok:true,sugestoes:[]});
  const db=readDB(); const qn=norm(q);
  const set1=new Set(), set2=new Set(), set3=new Set();
  db.propostas.forEach(r=>{const n=nomeConvP1(r);if(n&&norm(n).includes(qn))set1.add(n);});
  (db.cartoes||[]).forEach(r=>nomesConvP2(r).forEach(n=>{if(n&&norm(n).includes(qn))set2.add(n);}));
  (db.fictor||[]).forEach(r=>{const n=String(r['Convênio']||r['Convenio']||'').trim();if(n&&norm(n).includes(qn))set3.add(n);});
  const grupos={};
  [...set1,...set2,...set3].forEach(nome=>{const k=norm(nome);if(!grupos[k]||nome.length>grupos[k].length)grupos[k]=nome;});
  res.json({ok:true, sugestoes:Object.values(grupos).sort((a,b)=>a.localeCompare(b,'pt-BR'))});
});

// ════════════════════════════════════════════════════════════
//  CONSULTA CONVÊNIO
// ════════════════════════════════════════════════════════════
app.get('/api/convenio', (req, res) => {
  const {q}=req.query;
  if(!q||q.trim().length<2) return res.status(400).json({ok:false,msg:'Busca muito curta.'});
  const db=readDB();
  const propostas=db.propostas.filter(r=>matchConvenio(q,r,1));
  const cartoes=(db.cartoes||[]).filter(r=>matchConvenio(q,r,2));
  const fictor=(db.fictor||[]).filter(r=>{
    const qn=norm(q);
    return norm(String(r['Convênio']||r['Convenio']||'')).includes(qn);
  });
  if(!propostas.length&&!cartoes.length&&!fictor.length) return res.json({ok:true,found:false});

  // Nome e CNPJ mais frequentes
  const nf={};
  propostas.forEach(r=>{const n=nomeConvP1(r);if(n)nf[n]=(nf[n]||0)+1;});
  const nomeExibido=Object.entries(nf).sort((a,b)=>b[1]-a[1])[0]?.[0]||nomesConvP2(cartoes[0]||{})[0]||q;
  const cf={};
  propostas.forEach(r=>{const c=String(r['CNPJ Convênio']||r['CNPJ Convenio']||'').trim();if(c)cf[c]=(cf[c]||0)+1;});
  const cnpjExibido=Object.entries(cf).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';

  // IPP — calculado dinamicamente: servidores / contratos pagos
  const servRows=(db.servidores||[]);
  const ippRows=(db.ipp||[]);
  let ippValor=null, ippNome=null, ippDetalhe=null;

  // Helper: normaliza numero de servidores (pode vir como "~60.000", "1.835", 284, "?")
  const parseServ=(v)=>{
    if(!v||v==='?'||v==='-') return null;
    const n=parseFloat(String(v).replace(/[~.]/g,'').replace(',','.'));
    return isNaN(n)?null:n;
  };

  // Helper: encontra linha pelo nome ou CNPJ
  const findRow=(rows,getNome,getCNPJ)=>{
    const qnNome=norm(nomeExibido);
    const qCNPJ=cleanCNPJ(cnpjExibido);
    // 1. CNPJ exato
    if(qCNPJ.length>=8){
      const r=rows.find(r=>cleanCNPJ(getCNPJ(r))===qCNPJ);
      if(r) return r;
    }
    // 2. Nome exato
    let r=rows.find(r=>norm(getNome(r))===qnNome);
    if(r) return r;
    // 3. Nome parcial
    r=rows.find(r=>{const rn=norm(getNome(r));return rn.includes(qnNome)||qnNome.includes(rn);});
    if(r) return r;
    // 4. Query original
    const qnQ=norm(q);
    return rows.find(r=>{const rn=norm(getNome(r));return rn===qnQ||rn.includes(qnQ)||qnQ.includes(rn);});
  };

  // Tenta calcular IPP via planilha de servidores
  if(servRows.length){
    const getNomeServ=(r)=>String(r['PREFEITURA']||r['Prefeitura']||r['Nome']||Object.values(r)[0]||'').trim();
    const getCNPJServ=(r)=>String(r['CNPJ']||'');
    const servRow=findRow(servRows,getNomeServ,getCNPJServ);
    if(servRow){
      const qtdServ=parseServ(servRow['Quantidade Exata de Servidores Ativos']||servRow['Servidores']||servRow['Total']);
      if(qtdServ!==null){
        // Conta contratos pagos nas 3 planilhas
        const isPago=(st)=>{
          const sl=norm(String(st||''));
          return sl.includes('paga')||sl.includes('encerrado')||sl.includes('encerrada')||
                 sl.includes('ativo')||sl.includes('ativa')||sl.includes('andamento')||
                 sl.includes('quitado');
        };
        const ctProp=propostas.filter(r=>isPago(r['Status'])).length;
        const ctCart=cartoes.filter(r=>isPago(r['Status'])).length;
        const ctFict=fictor.filter(r=>isPago(r['Status'])).length;
        const totalContratos=ctProp+ctCart+ctFict;
        if(totalContratos>0){
          ippValor=((qtdServ/totalContratos)*100);
          ippNome=getNomeServ(servRow);
          ippDetalhe={qtdServ,totalContratos,ctProp,ctCart,ctFict};
        }
      }
    }
  }

  // Fallback: usa planilha de IPP se servidores não disponível ou não encontrou
  if(ippValor===null&&ippRows.length){
    const getNomeIPP=(r)=>String(r['Convênio']||r['Convenio']||r['Nome do Convênio']||r['Nome do Convenio']||Object.values(r)[0]||'').trim();
    const getCNPJIPP=(r)=>String(r['CNPJ']||'');
    const ippRow=findRow(ippRows,getNomeIPP,getCNPJIPP);
    if(ippRow){
      const ipp=ippRow['IPP'];
      if(ipp!==undefined&&ipp!==null&&ipp!==''&&!String(ipp).startsWith('=')){
        const n=pNum(ipp); if(n!==0){ippValor=n*100; ippNome=getNomeIPP(ippRow);}
      }
    }
  }

  // KPIs propostas
  let totS=0,totD=0,totI=0,totSCancel=0,qtdCancel=0;
  const stCnt={},regimeCntAtivo={},prodCntAtivo={};
  propostas.forEach(r=>{
    const st=String(r['Status']||'Desconhecido').trim();
    const stNorm=norm(st);
    const vlr=pNum(r['Vlr Solicitado']||0);
    const rg=String(r['Regime Juridico Contratação']||r['Regime Juridico Contratacao']||'Não informado').trim();
    const pr=String(r['Produto']||'Não informado').trim();
    stCnt[st]=(stCnt[st]||0)+1;
    const cancelada=stNorm.includes('cancel')||stNorm.includes('reprova')||stNorm.includes('recusad')||stNorm.includes('negad');
    if(cancelada){totSCancel+=vlr;qtdCancel++;}
    else{totS+=vlr;totD+=pNum(r['Vlr Total da Dívida']||0);totI+=pNum(r['Se Inadimplente (Valor)']||0);regimeCntAtivo[rg]=(regimeCntAtivo[rg]||0)+1;prodCntAtivo[pr]=(prodCntAtivo[pr]||0)+1;}
  });
  const statusListProp=Object.entries(stCnt).map(([s,q])=>({status:s,qtd:q})).sort((a,b)=>b.qtd-a.qtd);
  const regimeList=Object.entries(regimeCntAtivo).map(([r,q])=>({regime:r,qtd:q})).sort((a,b)=>b.qtd-a.qtd);
  const produtoList=Object.entries(prodCntAtivo).map(([p,q])=>({produto:p,qtd:q})).sort((a,b)=>b.qtd-a.qtd);

  // KPIs cartões
  let totVOP=0,totLiq=0,totPar=0,totVOPCancel=0,qtdCancelCart=0;
  const stCntC={};
  cartoes.forEach(r=>{
    const st=String(r['Status']||'Desconhecido').trim();
    const stNorm=norm(st);
    const vop=pNum(r['VOP']||0);
    stCntC[st]=(stCntC[st]||0)+1;
    const canceladaCart=stNorm.includes('cancel')||stNorm.includes('reprova')||stNorm.includes('erro')||stNorm.includes('rascunho');
    if(canceladaCart){totVOPCancel+=vop;qtdCancelCart++;}
    else{totVOP+=vop;totLiq+=pNum(r['Líquido']||r['Liquido']||0);totPar+=pNum(r['Total Parcelas']||0);}
  });
  const statusListCart=Object.entries(stCntC).map(([s,q])=>({status:s,qtd:q})).sort((a,b)=>b.qtd-a.qtd);

  // KPIs Fictor
  let totFictor=0,totFictorCancel=0,qtdFictorAtivo=0,qtdFictorCancel=0;
  const stCntF={},prodCntF={};
  fictor.forEach(r=>{
    const st=String(r['Status']||'Desconhecido').trim();
    const stNorm=norm(st);
    const vlr=pNum(r['Vlr Solicitado']||0);
    const pr=String(r['Produto']||'Não informado').trim();
    stCntF[st]=(stCntF[st]||0)+1;
    const cancelF=stNorm.includes('cancel')||stNorm.includes('reprova')||stNorm.includes('recusad')||stNorm.includes('negad');
    if(cancelF){totFictorCancel+=vlr;qtdFictorCancel++;}
    else{totFictor+=vlr;qtdFictorAtivo++;prodCntF[pr]=(prodCntF[pr]||0)+1;}
  });
  const statusListFictor=Object.entries(stCntF).map(([s,q])=>({status:s,qtd:q})).sort((a,b)=>b.qtd-a.qtd);
  const produtoListFictor=Object.entries(prodCntF).map(([p,q])=>({produto:p,qtd:q})).sort((a,b)=>b.qtd-a.qtd);

  // Filtros
  const uniq=(arr,key)=>[...new Set(arr.map(r=>String(r[key]||'').trim()).filter(Boolean))].sort();
  const filtros={
    produto:  uniq(propostas,'Produto'),
    regime:   uniq(propostas,'Regime Juridico Contratação'),
    status:   [...new Set(propostas.map(r=>String(r['Status']||'').trim()).filter(Boolean))].sort(),
    produto2: uniq(cartoes,'Produto'),
    status2:  [...new Set(cartoes.map(r=>String(r['Status']||'').trim()).filter(Boolean))].sort(),
  };

  const propList=propostas.map(r=>({
    id:String(r['ID da Proposta']||'—'),cliente:String(r['Nome do Cliente']||'—'),cpf:String(r['CPF do Cliente']||'—'),
    status:String(r['Status']||'—'),nomeConv:nomeConvP1(r),produto:String(r['Produto']||'—'),
    regime:String(r['Regime Juridico Contratação']||r['Regime Juridico Contratacao']||'—'),
    vlrSolicitado:pNum(r['Vlr Solicitado']||0),vlrDivida:pNum(r['Vlr Total da Dívida']||0),vlrInad:pNum(r['Se Inadimplente (Valor)']||0),
    vlrParcela:pNum(r['Vlr Parcela']||0),prazo:String(r['Prazo']||'—'),taxa:String(r['Taxa de Juros Real']||'—'),
    cetMensal:String(r['CET Mensal']||'—'),colaborador:String(r['Colaborador']||'—'),
    dataInclusao:String(r['Data de Inclusão']||'—'),dataPagto:String(r['Data de Pagamento']||'—'),
    profissao:String(r['Profissão']||r['Profissao']||'—'),estadoCivil:String(r['Estado Civil']||'—'),
    telefone:String(r['Telefone']||'—'),email:String(r['E-mail']||'—'),endereco:String(r['Endereço']||r['Endereco']||'—'),
    banco:String(r['Número do Banco']||'—'),agencia:String(r['Agência']||r['Agencia']||'—'),conta:String(r['Conta']||'—'),
    tabela:String(r['Tabela']||'—'),matricula:String(r['Matrícula']||r['Matricula']||'—'),
    secretaria:String(r['Secretaria/Filial']||'—'),vlrIOF:pNum(r['Vlr IOF Total']||0),
    vlrTotal:pNum(r['Vlr Total do Crédito']||0),vlrLiquido:pNum(r['Vlr Líquido do Cliente']||r['Vlr Liquido do Cliente']||0),
    primVenc:String(r['Data Primeiro Vencimento']||'—'),ultVenc:String(r['Data Último Vencimento']||'—'),
  }));

  const cartList=cartoes.map(r=>({
    op:String(r['Op']||'—'),cliente:String(r['Cliente']||'—'),cpf:String(r['CPF / CNPJ']||'—'),
    empregador:String(r['Razão social empregador']||r['Razao social empregador']||'—'),
    convenio:String(r['Convênio']||r['Convenio']||'—'),produto:String(r['Produto']||'—'),status:String(r['Status']||'—'),
    vop:pNum(r['VOP']||0),liquido:pNum(r['Líquido']||r['Liquido']||0),totalParcelas:pNum(r['Total Parcelas']||0),
    prazo:String(r['Prazo em meses']||'—'),taxa:String(r['Taxa nominal']||'—'),cet:String(r['CET']||'—'),
    operador:String(r['Operador']||'—'),primVenc:r['Primeiro vencimento']||'—',
    ultVenc:r['Último vencimento']||r['Ultimo vencimento']||'—',iof:pNum(r['IOF']||0),
    seguro:pNum(r['Seguro']||0),totalAmort:pNum(r['Total Amortização']||r['Total Amortizacao']||0),
    totalJuros:pNum(r['Total Juros']||0),banco:String(r['Banco']||'—'),agencia:String(r['Agencia']||'—'),
    conta:String(r['Conta']||'—'),estadoCivil:String(r['Estado Civil']||'—'),cidade:String(r['Cidade']||'—'),uf:String(r['Estado (UF)']||'—'),
  }));

  res.json({
    ok:true, found:true,
    convenio:{nome:nomeExibido, cnpj:cnpjExibido},
    ipp:{valor:ippValor, nome:ippNome, detalhe:ippDetalhe},
    kpisPropostas:{total:propostas.length,totalAtivo:propostas.length-qtdCancel,totalCancelado:qtdCancel,totS,totSCancel,totD,totI,statusList:statusListProp,regimeList,produtoList},
    kpisCartoes:{total:cartoes.length,totalAtivo:cartoes.length-qtdCancelCart,totalCancelado:qtdCancelCart,totVOP,totVOPCancel,totLiq,totPar,statusList:statusListCart},
    kpisFictor:{total:fictor.length,totalAtivo:qtdFictorAtivo,totalCancelado:qtdFictorCancel,totFictor,totFictorCancel,statusList:statusListFictor,produtoList:produtoListFictor},
    filtros, propostas:propList, cartoes:cartList,
    fictor:fictor.map(r=>({
      id:String(r['ID da Proposta']||'—'),nome:String(r['Nome']||'—'),cpf:String(r['CPF']||'—'),
      convenio:String(r['Convênio']||r['Convenio']||'—'),produto:String(r['Produto']||'—'),
      status:String(r['Status']||'—'),vlr:pNum(r['Vlr Solicitado']||0),vlrTotal:pNum(r['Vlr Total do Crédito']||0),
      vlrLiq:pNum(r['Vlr Liquido do Cliente']||0),vlrParcela:pNum(r['Vlr Parcela']||0),
      prazo:String(r['Prazo']||'—'),digitador:String(r['Digitador']||'—'),promotora:String(r['Promotora']||'—'),
      dataInclusao:String(r['Data de Inclusão']||r['Data de Inclusao']||'—'),dataPagto:String(r['Data de Pagamento']||'—'),
    })),
  });
});

// ════════════════════════════════════════════════════════════
//  LIMPAR DADOS
// ════════════════════════════════════════════════════════════
app.delete('/api/dados', (req, res) => {
  writeDB({propostas:[],cartoes:[],fictor:[],ipp:[],servidores:[],updatedAt:null,f1:'',f2:'',f3:'',f4:'',f5:''});
  res.json({ok:true});
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ✅  RC Convênios rodando!');
  console.log(`  🌐  http://localhost:${PORT}\n`);
});
