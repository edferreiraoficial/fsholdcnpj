import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import EmailSendersPanel, { type EmailSender } from './EmailSendersPanel';
import EmailGroupsPanel, { type EmailSenderGroup } from './EmailGroupsPanel';

const modeloPadrao = `<p>Olá, responsável pela <strong>{{razao_social}}</strong>,</p>

<p>Meu nome é <strong>Edson Ferreira</strong>, sou contador há mais de 20 anos e atuo em Paulínia e região, auxiliando empresas na regularização de CNPJ e pendências perante a Receita Federal.</p>

<p>Identificamos que o CNPJ <strong>{{cnpj}}</strong>, de <strong>{{municipio}}/{{uf}}</strong>, consta atualmente com situação cadastral <strong>{{situacao_cadastral}}</strong>, desde <strong>{{data_situacao}}</strong>.</p>

<p>Manter uma empresa nessa condição pode trazer dificuldades importantes. Além de impedir o funcionamento regular do CNPJ, a situação pode dificultar emissão de documentos fiscais, movimentações bancárias, obtenção de crédito, operações comerciais e uma eventual retomada das atividades.</p>

<p>Dependendo da origem das pendências e da situação específica da empresa, também podem existir reflexos para os sócios, principalmente quando há obrigações tributárias ou cadastrais ainda não resolvidas. Por isso, mesmo que a empresa esteja atualmente sem atividade, é importante identificar o que provocou essa situação e qual é o procedimento adequado para solucioná-la.</p>

<p><strong>A boa notícia é que muitos desses casos podem ser resolvidos de maneira relativamente simples e com baixo custo.</strong></p>

<p>Nosso trabalho começa pela análise das pendências que levaram o CNPJ à situação <strong>{{situacao_cadastral}}</strong>. A partir desse diagnóstico, cuidamos das obrigações e procedimentos necessários para buscar a regularização da empresa perante a Receita Federal.</p>

<p>Trabalhamos com <strong>honorários acessíveis, atendimento direto e foco na solução rápida do problema</strong>. Nos casos em que não existam outras restrições ou situações mais complexas, o CNPJ pode voltar à situação ATIVA em poucos dias após a regularização das pendências.</p>

<p>Se tiver interesse, responda a este e-mail ou entre em contato conosco. Podemos realizar uma análise inicial e explicar o que precisa ser regularizado, o prazo estimado e o custo do serviço antes de você decidir pela contratação.</p>

<p>Atenciosamente,<br>
<strong>Edson Ferreira</strong><br>
<strong>Contador – mais de 20 anos de experiência</strong><br>
<strong>FSHold Assessoria</strong><br>
Paulínia – SP<br>
<strong>WhatsApp / Telefone: {{whatsapp}}</strong></p>`;

type Modelo = {
  id:number;
  nome:string;
  assunto:string;
  corpo_html:string;
};

export default function EmailCampaignPage(){
  const [tab,setTab]=useState(0);
  const [composeTab,setComposeTab]=useState(0);
  const [progressoLote,setProgressoLote]=useState<any>(null);
  const [filters,setFilters]=useState<any>({});

  const [total,setTotal]=useState(0);
  const [sample,setSample]=useState<any[]>([]);
  const [excludedIds,setExcludedIds]=useState<number[]>([]);
  const [somenteSelecionados,setSomenteSelecionados]=useState(false);
  const [enviarSemCampanha,setEnviarSemCampanha]=useState(false);
  const [adicionarCampanhaExistente,setAdicionarCampanhaExistente]=useState(false);
  const [campanhaExistenteId,setCampanhaExistenteId]=useState<number|''>('');
  const [ignorarJaEnviados,setIgnorarJaEnviados]=useState(true);

  const [nome,setNome]=useState('Campanha comercial');
  const [assunto,setAssunto]=useState('');
  const [corpoHtml,setCorpoHtml]=useState('');
  const [testeEmail,setTesteEmail]=useState('');
  const [remetentes,setRemetentes]=useState<EmailSender[]>([]);
  const [remetenteId,setRemetenteId]=useState<number|''>('');
  const [gruposRemetentes,setGruposRemetentes]=useState<EmailSenderGroup[]>([]);
  const [grupoRemetenteId,setGrupoRemetenteId]=useState<number|''>('');
  const [pendentesLista,setPendentesLista]=useState<any[]>([]);
  const [pendentesListaTotal,setPendentesListaTotal]=useState(0);
  const [pendentesListaPage,setPendentesListaPage]=useState(0);
  const [pendentesListaPageSize,setPendentesListaPageSize]=useState(25);

  const [modelos,setModelos]=useState<Modelo[]>([]);
  const [modeloId,setModeloId]=useState<number|''>('');
  const [modeloNome,setModeloNome]=useState('');

  const [loading,setLoading]=useState(false);
  const [sending,setSending]=useState(false);
  const [erro,setErro]=useState('');
  const [sucesso,setSucesso]=useState('');

  const [campanhaId,setCampanhaId]=useState<number|null>(null);
  const [pendentes,setPendentes]=useState(0);
  const [enviados,setEnviados]=useState(0);
  const [falhas,setFalhas]=useState(0);
  const [quantidadeEnvio,setQuantidadeEnvio]=useState(500);
  const [intervaloGlobalSegundos,setIntervaloGlobalSegundos]=useState(2);
  const [intervaloRemetenteSegundos,setIntervaloRemetenteSegundos]=useState(10);

  const [historico,setHistorico]=useState<any[]>([]);
  const [historicoPage,setHistoricoPage]=useState(0);
  const [historicoPageSize,setHistoricoPageSize]=useState(25);
  const [detalhe,setDetalhe]=useState<any|null>(null);
  const [destinatarios,setDestinatarios]=useState<any[]>([]);
  const [statusDest,setStatusDest]=useState('');
  const [destPage,setDestPage]=useState(1);
  const [destPageSize,setDestPageSize]=useState(25);
  const [destTotal,setDestTotal]=useState(0);

  const selectedPreviewIds = useMemo(
    () => sample
      .map(x=>Number(x.prospect_id))
      .filter(id=>!excludedIds.includes(id)),
    [sample,excludedIds]
  );

  useEffect(()=>{
    try{
      const saved=JSON.parse(
        localStorage.getItem('fshold_last_filters')||'{}'
      );
      setFilters(saved);
      preview(saved);
    }catch{
      preview({});
    }

    carregarModelos();
    carregarHistorico();
    carregarRemetentes();
    carregarGruposRemetentes();
  },[]);


  useEffect(()=>{ if(campanhaId&&!enviarSemCampanha) carregarPendentesCampanha(campanhaId,pendentesListaPage,pendentesListaPageSize); },[pendentesListaPage,pendentesListaPageSize]);

  const carregarGruposRemetentes=async()=>{
    try{
      const {data}=await api.get('/email-sender-groups');
      const ativos=(data||[]).filter((x:any)=>Boolean(x.ativo));
      setGruposRemetentes(ativos);
      setGrupoRemetenteId(prev=>prev || ativos[0]?.id || '');
    }catch{}
  };

  const carregarPendentesCampanha=async(id=campanhaId,page=pendentesListaPage,pageSize=pendentesListaPageSize)=>{
    if(!id){setPendentesLista([]);setPendentesListaTotal(0);return;}
    try{
      const {data}=await api.get(`/email-campaigns/${id}/recipients`,{params:{status:'PENDENTE',page:page+1,pageSize}});
      const totalAtual=Number(data.total||0);
      setPendentesLista(data.items||[]);
      setPendentesListaTotal(totalAtual);
      if(totalAtual>0 && page>0 && page*pageSize>=totalAtual){
        setPendentesListaPage(Math.max(0,Math.ceil(totalAtual/pageSize)-1));
      }
    }catch{}
  };

  const carregarRemetentes=async()=>{
    try{
      const {data}=await api.get('/email-senders');
      const ativos=(data||[]).filter((x:any)=>Boolean(x.ativo));
      setRemetentes(ativos);
      setRemetenteId(prev=>{
        if(prev) return prev;
        const padrao=ativos.find((x:any)=>Boolean(x.padrao));
        return padrao?.id || ativos[0]?.id || '';
      });
    }catch{}
  };

  const carregarModelos=async()=>{
    try{
      const {data}=await api.get('/email-models');
      setModelos(data||[]);
    }catch{}
  };

  const carregarHistorico=async()=>{
    try{
      const {data}=await api.get('/email-campaigns');
      setHistorico(data||[]);
      setHistoricoPage(0);
    }catch{}
  };

  const selectionPayload=()=>{
    if(somenteSelecionados){
      return {
        includeProspectIds:selectedPreviewIds,
        excludeProspectIds:[]
      };
    }

    return {
      includeProspectIds:[],
      excludeProspectIds:excludedIds
    };
  };

  const preview=async(f=filters)=>{
    setLoading(true);
    setErro('');

    try{
      const {data}=await api.post('/email-campaigns/preview',{
        filters:f,
        ...selectionPayload(),
        assunto,
        corpoHtml,
        ignorarJaEnviados,
        limit:100
      });

      setTotal(Number(data.total||0));
      setSample(data.sample||[]);

    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }finally{
      setLoading(false);
    }
  };

  const toggleRecipient=(id:number)=>{
    setExcludedIds(prev =>
      prev.includes(id)
        ? prev.filter(x=>x!==id)
        : [...prev,id]
    );
  };

  const teste=async()=>{
    setErro('');
    setSucesso('');

    try{
      const {data}=await api.post('/email-campaigns/test',{
        to:testeEmail,
        assunto,
        corpoHtml,
        remetenteId:remetenteId||undefined,
        grupoRemetenteId:grupoRemetenteId||undefined
      });

      if(data?.ok===false){
        setErro(data.message||'Não foi possível enviar o e-mail de teste.');
        return;
      }

      setSucesso(
        `E-mail de teste enviado para ${testeEmail}.`
      );

    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }
  };

  const marcarEnviosAnteriores=async()=>{
    setErro('');
    setSucesso('');
    setLoading(true);

    try{
      const {data}=await api.post('/email-campaigns/mark-previous-sent',{
        assunto,
        corpoHtml,
        filters,
        ...selectionPayload()
      });

      setSucesso(
        data.marcados
          ? `${Number(data.marcados).toLocaleString('pt-BR')} envio(s) anterior(es) foram marcados como já enviados para esta mensagem.`
          : (data.message || 'Nenhum envio anterior foi encontrado.')
      );

      await preview();

    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }finally{
      setLoading(false);
    }
  };

  const enviarDireto=async()=>{
    setErro('');
    setSucesso('');
    setLoading(true);

    try{
      const {data}=await api.post('/email-campaigns/send-direct',{
        assunto,
        corpoHtml,
        filters,
        ...selectionPayload(),
        ignorarJaEnviados,
        remetenteId:remetenteId||undefined,
        grupoRemetenteId:grupoRemetenteId||undefined
      });

      if(!data.ok){
        throw new Error(data.message||'Não foi possível realizar o envio.');
      }

      setSucesso(
        `Envio sem campanha concluído: ` +
        `${Number(data.enviados||0).toLocaleString('pt-BR')} enviado(s) e ` +
        `${Number(data.falhas||0).toLocaleString('pt-BR')} falha(s).`
      );
    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }finally{
      setLoading(false);
    }
  };

  const criar=async()=>{
    setErro('');
    setSucesso('');
    setLoading(true);

    try{
      const {data}=await api.post('/email-campaigns',{
        nome,
        assunto,
        corpoHtml,
        filters,
        ...selectionPayload(),
        remetenteId:remetenteId||undefined,
        grupoRemetenteId:grupoRemetenteId||undefined
      });

      if(!data.ok){
        throw new Error(data.message||'Não foi possível criar a campanha.');
      }

      setCampanhaId(data.id);
      setPendentes(data.total);
      setEnviados(0);
      setFalhas(0);

      setSucesso(
        `Campanha #${data.id} criada com ` +
        `${Number(data.total).toLocaleString('pt-BR')} destinatários únicos.`
      );

      carregarHistorico();
      carregarPendentesCampanha(data.id);

    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }finally{
      setLoading(false);
    }
  };

  const alterarRemetenteCampanha=async()=>{
    if(!campanhaId||!remetenteId) return;
    setErro(''); setSucesso('');
    try{
      const {data}=await api.put(`/email-campaigns/${campanhaId}/sender`,{remetenteId});
      if(data.ok===false) throw new Error(data.message||'Não foi possível alterar o remetente.');
      setSucesso(`Remetente da campanha #${campanhaId} alterado. Você pode continuar os pendentes.`);
      await carregarHistorico();
    }catch(e:any){setErro(e?.response?.data?.message||e.message);}
  };

  const atualizarProgresso=async(id=campanhaId)=>{
    if(!id) return;
    try{
      const {data}=await api.get(`/email-campaigns/${id}/progress`);
      if(data?.ok===false) return;
      setProgressoLote(data);
      const stats=data.stats||{};
      setPendentes(Number(stats.pendentes||0));
      setEnviados(Number(stats.enviados||0));
      setFalhas(Number(stats.falhas||0));
      await carregarPendentesCampanha(id);
      if(data.lote_status==='CONCLUIDO'){setSending(false);setSucesso(data.lote_mensagem||'Lote concluído.');await carregarHistorico();}
      if(data.lote_status==='PAUSADO'||data.lote_status==='ERRO'){setSending(false);setErro(data.lote_mensagem||'O lote foi interrompido.');await carregarHistorico();}
    }catch{}
  };

  useEffect(()=>{
    if(!campanhaId || !sending) return;
    const tick=()=>atualizarProgresso(campanhaId);
    tick();
    const id=setInterval(tick,2500);
    return()=>clearInterval(id);
  },[campanhaId,sending]);

  const enviarQuantidade=async()=>{
    if(!campanhaId) return;
    const quantidade=Math.max(1,Math.min(5000,Number(quantidadeEnvio)||500));
    setQuantidadeEnvio(quantidade);
    setSending(true);setErro('');setSucesso('');
    try{
      const {data}=await api.post(`/email-campaigns/${campanhaId}/process`,{limit:quantidade,grupoRemetenteId:grupoRemetenteId||undefined,remetenteId:remetenteId||undefined,rodizio:true,intervaloGlobalSegundos,intervaloRemetenteSegundos},{timeout:15000});
      if(data.ok===false) throw new Error(data.message||'Falha ao iniciar campanha.');
      setSucesso(data.message||'Lote iniciado em segundo plano. Você pode permanecer na tela acompanhando o progresso.');
      await atualizarProgresso(campanhaId);
    }catch(e:any){setSending(false);setErro(e?.response?.data?.message||e.message);}
  };

  const salvarNovoModelo=async()=>{
    setErro('');
    setSucesso('');

    if(!modeloNome.trim()){
      setErro('Informe um nome para o modelo.');
      return;
    }

    try{
      const {data}=await api.post('/email-models',{
        nome:modeloNome,
        assunto,
        corpoHtml
      });

      setSucesso(`Modelo #${data.id} salvo.`);
      setModeloNome('');
      await carregarModelos();
      setModeloId(data.id);

    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }
  };

  const atualizarModelo=async()=>{
    if(!modeloId) return;

    const modelo=modelos.find(x=>x.id===modeloId);
    if(!modelo) return;

    try{
      await api.put(`/email-models/${modeloId}`,{
        nome:modelo.nome,
        assunto,
        corpoHtml
      });

      setSucesso('Modelo atualizado.');
      await carregarModelos();

    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }
  };

  const excluirModelo=async()=>{
    if(!modeloId) return;

    if(!window.confirm('Deseja excluir este modelo?')) return;

    try{
      await api.delete(`/email-models/${modeloId}`);
      setModeloId('');
      setSucesso('Modelo excluído.');
      await carregarModelos();

    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }
  };

  const carregarModelo=(id:number|string)=>{
    const num=Number(id);
    setModeloId(num||'');

    if(!num){
      setAssunto('');
      setCorpoHtml('');
      return;
    }

    const m=modelos.find(x=>x.id===num);
    if(!m) return;

    // Carrega exatamente como o modelo foi salvo.
    setAssunto(m.assunto ?? '');
    setCorpoHtml(m.corpo_html ?? '');
  };

  const carregarCampanhaExistente=async(value:number|string)=>{
    const id=Number(value);
    setCampanhaExistenteId(id||'');

    if(!id){
      return;
    }

    setErro('');
    setLoading(true);

    try{
      const {data}=await api.get(`/email-campaigns/${id}`);

      if(data.ok===false){
        throw new Error(data.message||'Campanha não encontrada.');
      }

      const c=data.campanha;

      // Ao reutilizar, conserva exatamente a identidade e mensagem da campanha.
      setNome(c.nome ?? '');
      setAssunto(c.assunto ?? '');
      setCorpoHtml(c.corpo_html ?? '');
      setCampanhaId(id);setPendentesListaPage(0);
      carregarPendentesCampanha(id);
      if(c.remetente_id) setRemetenteId(Number(c.remetente_id));
      if(c.grupo_remetente_id) setGrupoRemetenteId(Number(c.grupo_remetente_id));

      const stats=data.stats||{};
      setPendentes(Number(stats.pendentes||0));
      setEnviados(Number(stats.enviados||0));
      setFalhas(Number(stats.falhas||0));

    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }finally{
      setLoading(false);
    }
  };

  const adicionarNaCampanha=async()=>{
    const id=Number(campanhaExistenteId);

    if(!id){
      setErro('Selecione a campanha que deseja reaproveitar.');
      return;
    }

    setErro('');
    setSucesso('');
    setLoading(true);

    try{
      const {data}=await api.post(
        `/email-campaigns/${id}/add-recipients`,
        {
          filters,
          ...selectionPayload()
        }
      );

      if(data.ok===false){
        throw new Error(data.message||'Não foi possível adicionar os destinatários.');
      }

      setCampanhaId(id);setPendentesListaPage(0);
      carregarPendentesCampanha(id);
      setPendentes(Number(data.pendentes||0));
      setEnviados(Number(data.enviados||0));
      setFalhas(Number(data.falhas||0));

      const adicionados=Number(data.adicionados||0);
      const duplicados=Number(data.ignoradosDuplicados||0);

      setSucesso(
        adicionados
          ? `${adicionados.toLocaleString('pt-BR')} novo(s) destinatário(s) ` +
            `adicionado(s) à campanha #${id}. ` +
            `${duplicados.toLocaleString('pt-BR')} duplicado(s) ignorado(s).`
          : (data.message ||
             `Nenhum novo destinatário foi adicionado à campanha #${id}.`)
      );

      await carregarHistorico();

    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }finally{
      setLoading(false);
    }
  };

  const abrirCampanha=async(id:number)=>{
    setErro('');

    try{
      const {data}=await api.get(`/email-campaigns/${id}`);

      if(data.ok===false){
        throw new Error(data.message);
      }

      setDetalhe(data);
      setCampanhaId(id);setPendentesListaPage(0);
      carregarPendentesCampanha(id);

      const stats=data.stats||{};
      setPendentes(Number(stats.pendentes||0));
      setEnviados(Number(stats.enviados||0));
      setFalhas(Number(stats.falhas||0));

      await carregarDestinatarios(id,1,statusDest);

    }catch(e:any){
      setErro(e?.response?.data?.message||e.message);
    }
  };

  const carregarDestinatarios=async(
    id=campanhaId,
    page=destPage,
    status=statusDest,
    pageSize=destPageSize
  )=>{
    if(!id) return;

    const {data}=await api.get(
      `/email-campaigns/${id}/recipients`,
      {
        params:{
          page,
          pageSize,
          status
        }
      }
    );

    setDestinatarios(data.items||[]);
    setDestTotal(Number(data.total||0));
    setDestPage(page);
  };

  const processados=Math.max(0,enviados+falhas);
  const campanhaTotal=pendentes+enviados+falhas;
  const progresso=campanhaTotal
    ? Math.min(100,(processados/campanhaTotal)*100)
    : 0;

  return <Stack spacing={2}>
    <Box>
      <Typography variant="h5" fontWeight={700}>
        Campanhas de E-mail
      </Typography>
      <Typography color="text.secondary">
        Modelos editáveis, seleção de destinatários e histórico integrado ao CRM.
      </Typography>
    </Box>

    <Alert severity="info">
      O sistema deduplica e-mails, ignora “Não contatar” e opt-out.
      Antes de disparos maiores, revise destinatários, remetente e conteúdo.
    </Alert>

    {erro&&<Alert severity="error">{erro}</Alert>}
    {sucesso&&<Alert severity="success">{sucesso}</Alert>}
    {progressoLote&&campanhaId&&<Paper variant="outlined" sx={{p:1.2}}><Stack spacing={.7}><Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight={700}>Envio em tempo real</Typography><Chip label={progressoLote.lote_status||'PARADO'} variant="outlined"/><Typography variant="caption">{progressoLote.lote_mensagem||''}</Typography></Stack><LinearProgress variant="determinate" value={Number(progressoLote.lote_total||0)?Math.min(100,Number(progressoLote.lote_processados||0)*100/Number(progressoLote.lote_total||1)):0}/><Typography variant="caption">Lote: {Number(progressoLote.lote_processados||0)}/{Number(progressoLote.lote_total||0)} · enviados {Number(progressoLote.lote_enviados||0)} · falhas {Number(progressoLote.lote_falhas||0)} · pendentes gerais {Number(progressoLote.stats?.pendentes||0)}</Typography></Stack></Paper>}

    <Paper variant="outlined">
      <Tabs value={tab} onChange={(_,v)=>setTab(v)}>
        <Tab label="Compor campanha"/>
        <Tab label="Modelos"/>
        <Tab label="Histórico"/>
        <Tab label="Remetentes"/>
      </Tabs>
    </Paper>

    {tab===0 && <Stack spacing={2}>
      <Paper variant="outlined"><Tabs value={composeTab} onChange={(_,v)=>setComposeTab(v)}><Tab label="Destinatários"/><Tab label="Mensagem e envio"/></Tabs></Paper>
      <Paper variant="outlined" sx={{p:3}}>
        <Stack spacing={2}>
          <Stack
            direction={{xs:'column',md:'row'}}
            spacing={2}
            alignItems={{md:'center'}}
          >
            <Typography fontWeight={700}>
              Destinatários elegíveis:
              {' '}
              {loading?'...':total.toLocaleString('pt-BR')}
            </Typography>

            <Button
              variant="outlined"
              onClick={()=>preview()}
              disabled={loading}
            >
              Recontar filtros
            </Button>

            <FormControlLabel
              control={
                <Checkbox
                  checked={somenteSelecionados}
                  onChange={e=>{
                    setSomenteSelecionados(e.target.checked);
                  }}
                />
              }
              label="Enviar somente para os selecionados na prévia"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={enviarSemCampanha}
                  onChange={e=>{
                    const checked=e.target.checked;
                    setEnviarSemCampanha(checked);

                    if(checked){
                      setAdicionarCampanhaExistente(false);
                      setCampanhaExistenteId('');
                      setCampanhaId(null);
                      setPendentes(0);
                      setEnviados(0);
                      setFalhas(0);
                    }
                  }}
                />
              }
              label="Enviar sem criar campanha"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={adicionarCampanhaExistente}
                  onChange={e=>{
                    const checked=e.target.checked;
                    setAdicionarCampanhaExistente(checked);

                    if(checked){
                      setEnviarSemCampanha(false);
                    }else{
                      setCampanhaExistenteId('');
                    }
                  }}
                />
              }
              label="Adicionar a uma campanha existente"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={ignorarJaEnviados}
                  onChange={e=>setIgnorarJaEnviados(e.target.checked)}
                />
              }
              label="Não enviar novamente a mesma mensagem"
            />
          </Stack>

          <Typography variant="caption" color="text.secondary">
            A prévia mostra até 100 destinatários. No modo normal, todos os
            filtrados participam e você pode desmarcar indivíduos da prévia.
            No modo “somente selecionados”, apenas os marcados abaixo entram.
          </Typography>

          {enviarSemCampanha && (
            <Alert severity="warning">
              Modo sem campanha ativado: os e-mails serão enviados diretamente
              aos destinatários filtrados/selecionados e registrados no histórico
              de cada prospect. Nenhuma campanha será criada.
            </Alert>
          )}

          {adicionarCampanhaExistente && (
            <Alert severity="info">
              Modo campanha existente: selecione abaixo a campanha que deseja
              continuar. O CRM mantém a mensagem original e adiciona somente
              destinatários que ainda não pertencem àquela campanha.
            </Alert>
          )}

          {ignorarJaEnviados && (
            <Alert severity="info">
              Proteção contra duplicidade ativada: o CRM ignora automaticamente
              qualquer prospect que já tenha recebido exatamente o mesmo assunto
              e corpo de e-mail.
            </Alert>
          )}

          {ignorarJaEnviados && (
            <Button
              variant="outlined"
              disabled={loading || !assunto.trim() || !corpoHtml.trim()}
              onClick={marcarEnviosAnteriores}
              sx={{alignSelf:'flex-start'}}
            >
              Marcar envios anteriores como já enviados
            </Button>
          )}

          {composeTab===0 && <>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">Incluir</TableCell>
                <TableCell>Empresa</TableCell>
                <TableCell>CNPJ</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell>Município</TableCell>
                <TableCell>Situação</TableCell>
                <TableCell>Data situação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sample.map(r=>{
                const id=Number(r.prospect_id);
                const checked=!excludedIds.includes(id);

                return <TableRow key={`${r.email}-${id}`}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={checked}
                      onChange={()=>toggleRecipient(id)}
                    />
                  </TableCell>
                  <TableCell>{r.razao_social||r.nome_fantasia||'-'}</TableCell>
                  <TableCell>{r.cnpj||'-'}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>{r.municipio}/{r.uf}</TableCell>
                  <TableCell>{r.situacao_cadastral||'-'}</TableCell>
                  <TableCell>
                    {r.data_situacao
                      ? new Date(r.data_situacao).toLocaleDateString('pt-BR')
                      : '-'}
                  </TableCell>
                </TableRow>
              })}
            </TableBody>
          </Table>

          </>}
          {composeTab===1 && <>
          <Divider/>

          <Grid container spacing={2}>
            {adicionarCampanhaExistente && (
              <Grid item xs={12}>
                <TextField
                  select
                  fullWidth
                  label="Campanha existente"
                  value={campanhaExistenteId}
                  onChange={e=>carregarCampanhaExistente(e.target.value)}
                  helperText="Ao selecionar, nome, assunto e corpo originais da campanha são carregados automaticamente."
                >
                  <MenuItem value="">Selecione uma campanha...</MenuItem>
                  {historico
                    .filter(c=>c.status!=='CANCELADA')
                    .map(c=>
                      <MenuItem key={c.id} value={c.id}>
                        #{c.id} - {c.nome} ({c.status})
                      </MenuItem>
                    )}
                </TextField>
              </Grid>
            )}

            {!adicionarCampanhaExistente && (
              <Grid item xs={12}>
                <TextField
                  select
                  fullWidth
                  label="Modelo de e-mail"
                  value={modeloId}
                  onChange={e=>carregarModelo(e.target.value)}
                  helperText="O assunto e o corpo são carregados exatamente como foram salvos."
                >
                  <MenuItem value="">Selecione um modelo...</MenuItem>
                  {modelos.map(m=>
                    <MenuItem key={m.id} value={m.id}>
                      {m.nome}
                    </MenuItem>
                  )}
                </TextField>
              </Grid>
            )}

            <Grid item xs={12} md={6}>
              <TextField
                select
                fullWidth
                label="Grupo de envio"
                value={grupoRemetenteId}
                onChange={e=>setGrupoRemetenteId(Number(e.target.value)||'')}
                helperText={gruposRemetentes.length?'Os e-mails do grupo serão rodiziados automaticamente. Um grupo pode ter somente 1 remetente.':'Cadastre um grupo na aba Remetentes.'}
              >
                <MenuItem value="">Selecione um grupo...</MenuItem>
                {gruposRemetentes.map(g=><MenuItem key={g.id} value={g.id}>{g.nome} — {Number(g.quantidade||0)} remetente(s)</MenuItem>)}
              </TextField>

            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Nome interno da campanha"
                value={nome}
                onChange={e=>setNome(e.target.value)}
                disabled={adicionarCampanhaExistente}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Assunto"
                value={assunto}
                onChange={e=>setAssunto(e.target.value)}
                disabled={adicionarCampanhaExistente}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                minRows={10}
                label="Corpo HTML editável"
                value={corpoHtml}
                onChange={e=>setCorpoHtml(e.target.value)}
                disabled={adicionarCampanhaExistente}
              />

              <Typography variant="caption" color="text.secondary">
                Variáveis disponíveis:
                {' {{razao_social}}'},
                {' {{nome_fantasia}}'},
                {' {{cnpj}}'},
                {' {{municipio}}'},
                {' {{uf}}'},
                {' {{situacao_cadastral}}'},
                {' {{data_situacao}}'},
                {' {{whatsapp}}'}.
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <Paper variant="outlined" sx={{p:1.5,minHeight:160}}><Typography fontWeight={700} sx={{mb:1}}>Visualização do e-mail</Typography><Typography variant="subtitle2" fontWeight={700}>{assunto||'(sem assunto)'}</Typography><Box sx={{mt:1,fontSize:12,'& p':{my:.6}}} dangerouslySetInnerHTML={{__html:corpoHtml||'<p>Selecione ou edite um modelo para visualizar.</p>'}}/></Paper>
            </Grid>

            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                type="email"
                label="Enviar teste para"
                value={testeEmail}
                onChange={e=>setTesteEmail(e.target.value)}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <Button
                fullWidth
                variant="outlined"
                sx={{height:'56px'}}
                disabled={!testeEmail}
                onClick={teste}
              >
                Enviar teste
              </Button>
            </Grid>
          </Grid>

          <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
            <Button
              variant="contained"
              disabled={
                loading ||
                total===0 ||
                sending ||
                (adicionarCampanhaExistente && !campanhaExistenteId)
              }
              onClick={
                enviarSemCampanha
                  ? enviarDireto
                  : adicionarCampanhaExistente
                    ? adicionarNaCampanha
                    : criar
              }
            >
              {loading
                ? <CircularProgress size={20}/>
                : enviarSemCampanha
                  ? 'Enviar agora sem campanha'
                  : adicionarCampanhaExistente
                    ? 'Adicionar à campanha existente'
                    : 'Criar nova campanha'}
            </Button>

            {!enviarSemCampanha && (<>
              <TextField
                type="number"
                size="small"
                label="Quantidade por envio"
                value={quantidadeEnvio}
                onChange={e=>setQuantidadeEnvio(Math.max(1,Math.min(5000,Number(e.target.value)||1)))}
                inputProps={{min:1,max:5000,step:1}}
                sx={{width:190}}
                helperText="Padrão: 500"
              />
              <TextField
                type="number" size="small" label="Intervalo global (segundos)"
                value={intervaloGlobalSegundos}
                onChange={e=>setIntervaloGlobalSegundos(Math.max(0,Math.min(300,Number(e.target.value)||2)))}
                inputProps={{min:0,max:300,step:1}} sx={{width:210}}
                helperText="Padrão: 2 segundos"
              />
              <TextField
                type="number" size="small" label="Intervalo por remetente (segundos)"
                value={intervaloRemetenteSegundos}
                onChange={e=>setIntervaloRemetenteSegundos(Math.max(1,Math.min(3600,Number(e.target.value)||10)))}
                inputProps={{min:1,max:3600,step:1}} sx={{width:250}}
                helperText="Padrão: 10 segundos por conta"
              />
              <Button
                variant="contained"
                disabled={!campanhaId||sending||pendentes===0}
                onClick={enviarQuantidade}
              >
                {sending
                  ? <CircularProgress size={20}/>
                  : `Enviar até ${Math.min(quantidadeEnvio,pendentes||quantidadeEnvio).toLocaleString('pt-BR')}`}
              </Button>
            </>)}
          </Stack>

          {campanhaId&&!enviarSemCampanha&&<Box>
            <Typography variant="body2">
              Campanha #{campanhaId}
              {' · '}enviados {enviados.toLocaleString('pt-BR')}
              {' · '}falhas {falhas.toLocaleString('pt-BR')}
              {' · '}pendentes {pendentes.toLocaleString('pt-BR')}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progresso}
              sx={{mt:1}}
            />
          </Box>}

          {campanhaId&&!enviarSemCampanha&&<Paper variant="outlined" sx={{p:2}}>
            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h6" fontWeight={700} sx={{flexGrow:1}}>Destinatários ainda não enviados ({pendentesListaTotal.toLocaleString('pt-BR')})</Typography>
                <Button size="small" variant="outlined" onClick={()=>carregarPendentesCampanha()}>Atualizar</Button>
              </Stack>
              <Typography variant="body2" color="text.secondary">A relação diminui automaticamente conforme os lotes são enviados.</Typography>
              <Table size="small"><TableHead><TableRow><TableCell>Empresa</TableCell><TableCell>CNPJ</TableCell><TableCell>E-mail</TableCell><TableCell>Tentativas</TableCell></TableRow></TableHead><TableBody>{pendentesLista.map(r=><TableRow key={r.id}><TableCell>{r.razao_social||r.nome_fantasia||'-'}</TableCell><TableCell>{r.cnpj||'-'}</TableCell><TableCell>{r.email}</TableCell><TableCell>{r.tentativas||0}</TableCell></TableRow>)}</TableBody></Table>
              <TablePagination component="div" count={pendentesListaTotal} page={pendentesListaPage} rowsPerPage={pendentesListaPageSize} onPageChange={(_,p)=>setPendentesListaPage(p)} onRowsPerPageChange={e=>{setPendentesListaPageSize(Number(e.target.value));setPendentesListaPage(0)}} rowsPerPageOptions={[25,50,100,250,500]}/>
            </Stack>
          </Paper>}
          </>}
        </Stack>
      </Paper>
    </Stack>}

    {tab===1 && <Paper variant="outlined" sx={{p:3}}>
      <Stack spacing={2}>
        <Typography variant="h6" fontWeight={700}>
          Modelos de e-mail
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <TextField
              select
              fullWidth
              label="Modelo salvo"
              value={modeloId}
              onChange={e=>carregarModelo(e.target.value)}
            >
              <MenuItem value="">Selecione...</MenuItem>
              {modelos.map(m=>
                <MenuItem key={m.id} value={m.id}>
                  {m.nome}
                </MenuItem>
              )}
            </TextField>
          </Grid>

          <Grid item xs={12} md={7}>
            <TextField
              fullWidth
              label="Nome para novo modelo"
              value={modeloNome}
              onChange={e=>setModeloNome(e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Assunto"
              value={assunto}
              onChange={e=>setAssunto(e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              minRows={10}
              label="Corpo HTML"
              value={corpoHtml}
              onChange={e=>setCorpoHtml(e.target.value)}
            />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            variant="contained"
            onClick={salvarNovoModelo}
          >
            Salvar como novo modelo
          </Button>

          <Button
            variant="outlined"
            disabled={!modeloId}
            onClick={atualizarModelo}
          >
            Atualizar modelo selecionado
          </Button>

          <Button
            color="error"
            variant="outlined"
            disabled={!modeloId}
            onClick={excluirModelo}
          >
            Excluir modelo
          </Button>
        </Stack>
      </Stack>
    </Paper>}

    {tab===2 && <Stack spacing={2}>
      <Paper variant="outlined" sx={{p:2}}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6" fontWeight={700} sx={{flexGrow:1}}>
            Histórico de campanhas
          </Typography>
          <Button variant="outlined" onClick={carregarHistorico}>
            Atualizar
          </Button>
        </Stack>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Campanha</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Total</TableCell>
              <TableCell>Enviados</TableCell>
              <TableCell>Falhas</TableCell>
              <TableCell>Pendentes</TableCell>
              <TableCell>Criada em</TableCell>
              <TableCell/>
            </TableRow>
          </TableHead>

          <TableBody>
            {historico.slice(historicoPage*historicoPageSize,historicoPage*historicoPageSize+historicoPageSize).map(c=>
              <TableRow key={c.id} hover>
                <TableCell>{c.id}</TableCell>
                <TableCell>{c.nome}</TableCell>
                <TableCell>
                  <Chip size="small" label={c.status}/>
                </TableCell>
                <TableCell>{Number(c.total_destinatarios||0).toLocaleString('pt-BR')}</TableCell>
                <TableCell>{Number(c.enviados_reais||0).toLocaleString('pt-BR')}</TableCell>
                <TableCell>{Number(c.falhas_reais||0).toLocaleString('pt-BR')}</TableCell>
                <TableCell>{Number(c.pendentes||0).toLocaleString('pt-BR')}</TableCell>
                <TableCell>
                  {c.criado_em
                    ? new Date(c.criado_em).toLocaleString('pt-BR')
                    : '-'}
                </TableCell>
                <TableCell>
                  <Button size="small" onClick={()=>abrirCampanha(c.id)}>
                    Abrir
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination component="div" count={historico.length} page={historicoPage} rowsPerPage={historicoPageSize} onPageChange={(_,p)=>setHistoricoPage(p)} onRowsPerPageChange={e=>{setHistoricoPageSize(Number(e.target.value));setHistoricoPage(0)}} rowsPerPageOptions={[25,50,100,250,500]}/>
      </Paper>

      {detalhe&&<Paper variant="outlined" sx={{p:3}}>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={700}>
            Campanha #{detalhe.campanha?.id} · {detalhe.campanha?.nome}
          </Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip label={`Status: ${detalhe.campanha?.status}`}/>
            <Chip label={`Enviados: ${Number(detalhe.stats?.enviados||0).toLocaleString('pt-BR')}`}/>
            <Chip label={`Falhas: ${Number(detalhe.stats?.falhas||0).toLocaleString('pt-BR')}`}/>
            <Chip label={`Pendentes: ${Number(detalhe.stats?.pendentes||0).toLocaleString('pt-BR')}`}/>
          </Stack>

          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              label="Status dos destinatários"
              value={statusDest}
              onChange={e=>{
                const value=e.target.value;
                setStatusDest(value);
                carregarDestinatarios(
                  detalhe.campanha.id,
                  1,
                  value,
                  destPageSize
                );
              }}
              sx={{minWidth:220}}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="PENDENTE">Pendentes</MenuItem>
              <MenuItem value="ENVIADO">Enviados</MenuItem>
              <MenuItem value="FALHOU">Falharam</MenuItem>
              <MenuItem value="REMOVIDO">Removidos</MenuItem>
            </TextField>

            <Button
              variant="outlined"
              onClick={()=>carregarDestinatarios(
                detalhe.campanha.id,
                destPage,
                statusDest,
                destPageSize
              )}
            >
              Atualizar destinatários
            </Button>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            {destTotal.toLocaleString('pt-BR')} destinatários neste filtro.
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Empresa</TableCell>
                <TableCell>CNPJ</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Tentativas</TableCell>
                <TableCell>Enviado em</TableCell>
                <TableCell>Erro</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {destinatarios.map(d=>
                <TableRow key={d.id}>
                  <TableCell>{d.razao_social||d.nome_fantasia||'-'}</TableCell>
                  <TableCell>{d.cnpj}</TableCell>
                  <TableCell>{d.email}</TableCell>
                  <TableCell>
                    <Chip size="small" label={d.status}/>
                  </TableCell>
                  <TableCell>{d.tentativas}</TableCell>
                  <TableCell>
                    {d.enviado_em
                      ? new Date(d.enviado_em).toLocaleString('pt-BR')
                      : '-'}
                  </TableCell>
                  <TableCell sx={{maxWidth:300}}>
                    <Typography
                      variant="caption"
                      sx={{wordBreak:'break-word'}}
                    >
                      {d.erro||''}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination component="div" count={destTotal} page={Math.max(0,destPage-1)} rowsPerPage={destPageSize} onPageChange={(_,p)=>carregarDestinatarios(detalhe?.campanha?.id||campanhaId,p+1,statusDest,destPageSize)} onRowsPerPageChange={e=>{const n=Number(e.target.value);setDestPageSize(n);carregarDestinatarios(detalhe?.campanha?.id||campanhaId,1,statusDest,n)}} rowsPerPageOptions={[25,50,100,250,500]}/>
        </Stack>
      </Paper>}
    </Stack>}

    {tab===3 && <Paper variant="outlined" sx={{p:3}}><Stack spacing={3}><EmailGroupsPanel onChange={carregarGruposRemetentes}/><Divider/><EmailSendersPanel onChange={carregarRemetentes}/></Stack></Paper>}
  </Stack>;
}
