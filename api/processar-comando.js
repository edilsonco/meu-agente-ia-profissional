// Importações necessárias
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import localizedFormat from 'dayjs/plugin/localizedFormat.js';
import 'dayjs/locale/pt-br.js';

// BACKEND V38 (Interpretação de Data Aprimorada para DD/MM e lógica de ano)
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.locale('pt-br');

// --- Configuração ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TIMEZONE_REFERENCIA = 'America/Sao_Paulo';

// --- Inicialização dos Clientes ---
let openai;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
} else {
  console.warn("Chave da API OpenAI não configurada.");
}

let supabase;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn("Credenciais do Supabase não configuradas.");
}

// --- Funções Auxiliares ---
function interpretarDataHoraComDayjs(dataRelativa, horarioTexto) {
  if (typeof dataRelativa !== 'string' || typeof horarioTexto !== 'string' || !dataRelativa.trim() || !horarioTexto.trim()) {
    console.error("interpretarDataHora (v38): Data ou Horário inválidos ou em falta.", { dataRelativa, horarioTexto });
    return null;
  }

  const agoraEmSaoPaulo = dayjs().tz(TIMEZONE_REFERENCIA);
  let dataAlvo = agoraEmSaoPaulo.clone().startOf('day');
  let dataNorm = dataRelativa.toLowerCase().trim();
  let horarioProcessado = horarioTexto.toLowerCase().trim().replace(/^(umas\s+|por volta d[ao]s\s+)/, '');

  console.log(`interpretarDataHora (v38): Input: dataRelativa='${dataRelativa}', horarioTexto='${horarioTexto}'`);

  const diasDaSemanaMap = {
    domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6
  };

  if (dataNorm === "hoje") {
    dataAlvo = agoraEmSaoPaulo.clone().startOf('day');
  } else if (dataNorm === "amanhã" || dataNorm === "amanha") {
    dataAlvo = agoraEmSaoPaulo.clone().add(1, 'day').startOf('day');
  } else {
    let ehProximaSemana = false;
    let nomeDiaParaBusca = dataNorm;
    if (dataNorm.startsWith("próxima ")) {
        nomeDiaParaBusca = dataNorm.substring("próxima ".length).trim();
        ehProximaSemana = true;
    }
    nomeDiaParaBusca = nomeDiaParaBusca.replace("-feira", "").trim();

    if (diasDaSemanaMap[nomeDiaParaBusca] !== undefined) {
        const diaAlvoNum = diasDaSemanaMap[nomeDiaParaBusca];
        dataAlvo = agoraEmSaoPaulo.day(diaAlvoNum);

        if (ehProximaSemana) {
             dataAlvo = dataAlvo.add(1, 'week');
        } else {
            if (dataAlvo.isBefore(agoraEmSaoPaulo.startOf('day'))) {
                dataAlvo = dataAlvo.add(1, 'week');
            }
        }
        dataAlvo = dataAlvo.startOf('day');
        console.log(`interpretarDataHora (v38): Dia da semana '${dataRelativa}' interpretado como:`, dataAlvo.format('YYYY-MM-DD'));
    } else { 
        let dataParseada = null;
        let anoFoiExtraidoOuParseado = false; 

        const mesesPt = {
            janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
            julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
        };
        const matchMesExtenso = dataNorm.match(/(\d{1,2})\s+(?:de\s+)?([a-zA-Zçã]+)(?:\s+(?:de\s+)?(\d{4}|\d{2}))?/i);

        if (matchMesExtenso) {
            const dia = parseInt(matchMesExtenso[1],10);
            const nomeMes = matchMesExtenso[2].toLowerCase();
            const mes = mesesPt[nomeMes];
            let anoStr = matchMesExtenso[3]; // Pode ser undefined se o ano não for fornecido
            let ano = anoStr ? parseInt(anoStr, 10) : agoraEmSaoPaulo.year();
            if (anoStr && anoStr.length === 2) ano = 2000 + ano;

            if (dia && mes && ano) {
                dataParseada = dayjs.tz(`${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`, 'YYYY-MM-DD', TIMEZONE_REFERENCIA, true);
                anoFoiExtraidoOuParseado = !!anoStr; // Verdadeiro se o ano estava na string original
            }
        }

        if (!dataParseada || !dataParseada.isValid()) {
            const formatosData = ['DD/MM/YYYY', 'DD-MM-YYYY', 'DD/MM/YY', 'DD-MM-YY', 'YYYY-MM-DD', 'DD/MM']; // Adicionado 'DD/MM'
            for (const formato of formatosData) {
                let tempDate = dayjs(dataRelativa, formato, 'pt-br', true); 
                if (tempDate.isValid()) {
                    dataParseada = tempDate;
                    if (formato.toLowerCase().includes('yyyy') || (formato.toLowerCase().includes('yy') && dataRelativa.match(/\d{2}$/))) {
                        anoFoiExtraidoOuParseado = true;
                    } else if (formato === 'DD/MM') { // Ano foi inferido como o atual
                        anoFoiExtraidoOuParseado = false;
                    }
                    console.log(`interpretarDataHora (v38) - Loop: Data parseada com formato '${formato}':`, dataParseada.format('YYYY-MM-DD'));
                    break;
                }
            }
        }

        if (dataParseada && dataParseada.isValid()) {
            if (!anoFoiExtraidoOuParseado && dataParseada.isBefore(agoraEmSaoPaulo.startOf('day'))) {
                dataParseada = dataParseada.year(agoraEmSaoPaulo.year() + 1);
                console.log(`interpretarDataHora (v38) - Ano ajustado para o próximo por estar no passado e sem ano explícito.`);
            }
            dataAlvo = dayjs.tz(dataParseada.format('YYYY-MM-DD'), 'YYYY-MM-DD', TIMEZONE_REFERENCIA, true).startOf('day');
        } else {
            console.error("interpretarDataHora (v38): Formato de data não reconhecido ou data inválida:", dataRelativa);
            return null;
        }
    }
  }

  let horas = 0, minutos = 0;
  if (horarioProcessado === "meio-dia") horas = 12;
  else if (horarioProcessado === "meia-noite") horas = 0;
  else {
    const matchHorario = horarioProcessado.match(/(\d{1,2})(?:h|:)?(\d{0,2})?/i);
    if (matchHorario) {
        horas = parseInt(matchHorario[1], 10);
        minutos = matchHorario[2] ? parseInt(matchHorario[2], 10) : 0;
        if (isNaN(horas) || isNaN(minutos) || horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
            console.error("interpretarDataHora (v38): Horas/minutos inválidos:", {horas, minutos});
            return null;
        }
    } else {
        console.error("interpretarDataHora (v38): Formato de horário não reconhecido:", horarioProcessado);
        return null;
    }
  }

  const dataHoraFinalEmSaoPaulo = dataAlvo.hour(horas).minute(minutos).second(0).millisecond(0);
  if (!dataHoraFinalEmSaoPaulo.isValid()) {
      console.error("interpretarDataHora (v38): Data/Hora final inválida em SP:", dataHoraFinalEmSaoPaulo.toString());
      return null;
  }
  console.log("interpretarDataHora (v38): Data/Hora final em São Paulo:", dataHoraFinalEmSaoPaulo.format('YYYY-MM-DD HH:mm:ss Z'));
  return dataHoraFinalEmSaoPaulo.utc();
}


async function gerarRespostaConversacional(contextoParaIA) {
  if (!openai) {
    return "Desculpe, estou com problemas para gerar uma resposta neste momento (IA não configurada).";
  }
  if (typeof contextoParaIA !== 'string' || !contextoParaIA.trim()) {
    return "Desculpe, não consegui processar a informação para gerar uma resposta.";
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Você é um assistente de agendamento virtual chamado "Agente IA", extremamente simpático, prestável e profissional. Responda sempre em português do Brasil. Seja claro e confirme as ações realizadas. Se houver um erro ou algo não for possível, explique de forma educada. Se precisar de mais informações para completar uma ação, peça-as de forma natural e específica. Nunca mencione IDs numéricos de reuniões diretamente para o utilizador, a menos que seja explicitamente pedido para depuração ou se precisar de desambiguar (neste caso, pode apresentar os detalhes completos para o utilizador escolher).`
        },
        { role: "user", content: contextoParaIA }
      ],
      temperature: 0.7, 
    });
    if (completion?.choices?.[0]?.message?.content) {
        return completion.choices[0].message.content.trim();
    } else {
        console.error("Backend (v38): Resposta da OpenAI inválida.", completion);
        return "Peço desculpa, não consegui obter uma resposta da IA neste momento.";
    }
  } catch (error) {
    console.error("Backend (v38): Erro ao gerar resposta com OpenAI:", error);
    return "Peço desculpa, ocorreu um erro ao tentar processar a sua resposta com a IA.";
  }
}

export default async function handler(req, res) {
  console.log("Backend (v38): Função handler iniciada.");

  if (req.method !== 'POST') {
    return res.status(405).json({ mensagem: `Método ${req.method} não permitido.` });
  }
  
  const { comando } = req.body;
  if (!comando || typeof comando !== 'string' || !comando.trim()) {
    return res.status(400).json({ mensagem: "Nenhum comando válido fornecido." });
  }

  if (!openai || !supabase) {
    console.error("Backend (v38): OpenAI ou Supabase não inicializados.");
    return res.status(500).json({ mensagem: "Erro de configuração interna do servidor." });
  }

  let mensagemParaFrontend = "";
  let dadosComando;

  try {
    const promptExtracao = `
      Comando do utilizador: "${comando}"
      Data/hora atual (UTC): ${new Date().toISOString()}
      Fuso horário de referência: America/Sao_Paulo

      Extraia em JSON:
      - intencao: ("marcar_reuniao", "listar_reunioes", "cancelar_reuniao", "alterar_reuniao", "pedido_incompleto", "desconhecida").
      - id_reuniao: ID numérico (inteiro ou null).
      
      // Nova reunião:
      - tipo_compromisso_novo: string ou null. Default "compromisso".
      - pessoa_nova_reuniao: string ou null. Se tipo específico (ex: "dentista") e pessoa ausente, usar tipo como pessoa.
      - data_nova_reuniao: string ou null.
      - horario_novo_reuniao: string ou null.

      // Alvo (cancelar/alterar SEM ID):
      - tipo_compromisso_alvo: string ou null.
      - pessoa_alvo: string ou null.
      - data_alvo: string ou null.
      - horario_alvo: string ou null.

      // Alteração (novos dados):
      - tipo_compromisso_alteracao: string ou null.
      - pessoa_alteracao: string ou null.
      - data_alteracao: string ou null, ou "manter".
      - horario_alteracao: string ou null, ou "manter".
      
      - mensagem_clarificacao_necessaria: string ou null. Preencha APENAS SE faltar informação crucial para a intenção.
          Ex: marcar: falta data/hora OU (pessoa E tipo são nulos/genéricos).
          Ex: cancelar sem ID: falta pessoa/data/hora do alvo.
          Ex: alterar: falta ID/descrição do alvo OU faltam todos os novos dados.
          Descreva o que falta. Senão, null.
      
      Responda APENAS com o objeto JSON.
    `;
    const extracaoResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125", 
      messages: [{ role: "user", content: promptExtracao }],
      response_format: { type: "json_object" },
    });

    if (!extracaoResponse?.choices?.[0]?.message?.content) {
        console.error("Backend (v38): Resposta da OpenAI para extração inválida.", extracaoResponse);
        mensagemParaFrontend = await gerarRespostaConversacional("Desculpe, tive um problema ao entender seu pedido. Poderia tentar de novo?");
        return res.status(500).json({ mensagem: mensagemParaFrontend });
    }
    
    const rawJsonFromOpenAI = extracaoResponse.choices[0].message.content;
    try {
      dadosComando = JSON.parse(rawJsonFromOpenAI);
    } catch (e) {
      console.error("Backend (v38): Erro parse JSON da extração OpenAI:", e, rawJsonFromOpenAI);
      mensagemParaFrontend = await gerarRespostaConversacional("Desculpe, tive um problema ao processar seu pedido. Tente de forma mais simples?");
      return res.status(500).json({ mensagem: mensagemParaFrontend });
    }

    if (!dadosComando || typeof dadosComando !== 'object') {
        console.error("Backend (v38): dadosComando não é objeto válido.", dadosComando);
        mensagemParaFrontend = await gerarRespostaConversacional("Desculpe, não estruturei seu pedido corretamente. Poderia reformular?");
        return res.status(500).json({ mensagem: mensagemParaFrontend });
    }
    console.log("Backend (v38): Dados extraídos:", dadosComando);

    if (dadosComando.mensagem_clarificacao_necessaria && typeof dadosComando.mensagem_clarificacao_necessaria === 'string') {
      console.log("Backend (v38): Clarificação necessária:", dadosComando.mensagem_clarificacao_necessaria);
      let contextoClarificacao = `O utilizador disse: "${comando}". Preciso de mais informações: ${dadosComando.mensagem_clarificacao_necessaria}. Formule uma pergunta amigável.`;
      if (dadosComando.intencao === "marcar_reuniao") {
         contextoClarificacao = `O utilizador quer marcar: "${comando}". Para continuar, preciso de: ${dadosComando.mensagem_clarificacao_necessaria}. Peça de forma natural.`;
      } else if (dadosComando.intencao === "cancelar_reuniao" && !dadosComando.id_reuniao) {
         contextoClarificacao = `O utilizador quer cancelar: "${comando}". Para encontrar o compromisso, preciso de: ${dadosComando.mensagem_clarificacao_necessaria}. Peça essa informação.`;
      } else if (dadosComando.intencao === "alterar_reuniao") {
         contextoClarificacao = `O utilizador quer alterar: "${comando}". Preciso de mais detalhes: ${dadosComando.mensagem_clarificacao_necessaria}. Peça essa informação.`;
      }
      mensagemParaFrontend = await gerarRespostaConversacional(contextoClarificacao);
    } else if (dadosComando.intencao && typeof dadosComando.intencao === 'string') {
      switch (dadosComando.intencao) {
        case "marcar_reuniao":
          const tipoCompromissoInput = dadosComando.tipo_compromisso_novo || "compromisso";
          const pessoaInput = dadosComando.pessoa_nova_reuniao; 
          const dataInput = dadosComando.data_nova_reuniao;
          const horarioInput = dadosComando.horario_novo_reuniao;

          let pessoaParaAgendar = pessoaInput;
          if (!pessoaParaAgendar && tipoCompromissoInput && !["compromisso", "reunião"].includes(tipoCompromissoInput.toLowerCase())) {
            pessoaParaAgendar = tipoCompromissoInput.charAt(0).toUpperCase() + tipoCompromissoInput.slice(1);
          }

          if (pessoaParaAgendar && dataInput && horarioInput) {
            const dataHoraUTC = interpretarDataHoraComDayjs(dataInput, horarioInput);
            if (!dataHoraUTC) {
              mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui interpretar a data/hora ("${dataInput}" às "${horarioInput}") para o ${tipoCompromissoInput} com ${pessoaParaAgendar}. Poderia tentar um formato diferente?`);
            } else if (dataHoraUTC.isBefore(dayjs.utc().subtract(1, 'minute'))) {
              mensagemParaFrontend = await gerarRespostaConversacional(`Não é possível marcar o ${tipoCompromissoInput} para ${dataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')}, pois está no passado.`);
            } else {
              const dataHoraSupabase = dataHoraUTC.toISOString();
              const { data: conflitos, error: erroConflito } = await supabase
                .from('reunioes')
                .select('id, pessoa, data_hora, tipo_compromisso')
                .eq('data_hora', dataHoraSupabase);

              if (erroConflito) { console.error("Supabase erro conflito:", erroConflito); throw erroConflito; }

              if (conflitos && conflitos.length > 0) {
                const c = conflitos[0];
                mensagemParaFrontend = await gerarRespostaConversacional(`Já existe um ${c.tipo_compromisso || 'compromisso'} com ${c.pessoa || 'alguém'} às ${dayjs(c.data_hora).tz(TIMEZONE_REFERENCIA).format('HH:mm')} de ${dayjs(c.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY')}. Quer tentar outro horário para seu ${tipoCompromissoInput} com ${pessoaParaAgendar}?`);
              } else {
                const { data: novaReuniao, error: erroInsert } = await supabase.from('reunioes').insert([{
                  pessoa: pessoaParaAgendar, data_hora: dataHoraSupabase, descricao_comando: comando, tipo_compromisso: tipoCompromissoInput 
                }]).select().single(); 

                if (erroInsert) { console.error("Supabase erro insert:", erroInsert); throw erroInsert; }
                
                const dataHoraConf = dataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
                let eventoDesc = tipoCompromissoInput.charAt(0).toUpperCase() + tipoCompromissoInput.slice(1);
                if (pessoaParaAgendar.toLowerCase() !== tipoCompromissoInput.toLowerCase() && tipoCompromissoInput !== "compromisso") {
                     eventoDesc += ` com ${pessoaParaAgendar}`;
                } else if (tipoCompromissoInput === "compromisso" && pessoaParaAgendar && pessoaParaAgendar.toLowerCase() !== "compromisso") {
                     eventoDesc = `Compromisso com ${pessoaParaAgendar}`;
                }
                mensagemParaFrontend = await gerarRespostaConversacional(`${eventoDesc} marcado para ${dataHoraConf} com sucesso! Posso ajudar em algo mais?`);
              }
            }
          } else {
            let oQueFalta = [];
            if (!pessoaParaAgendar && !tipoCompromissoInput) oQueFalta.push("o tipo de compromisso ou com quem seria");
            else if (!pessoaParaAgendar) oQueFalta.push("com quem seria o compromisso");
            if (!dataInput) oQueFalta.push("a data");
            if (!horarioInput) oQueFalta.push("o horário");
            mensagemParaFrontend = await gerarRespostaConversacional(`Para marcar, preciso de: ${oQueFalta.join(", ")}. Poderia informar? (Você disse: "${comando}")`);
          }
          break;

        case "listar_reunioes":
            const { data: reunioes, error: erroListagem } = await supabase.from('reunioes').select('id, pessoa, data_hora, tipo_compromisso').order('data_hora', { ascending: true });
            if (erroListagem) { console.error("Supabase erro listagem:", erroListagem); throw erroListagem; }
            if (reunioes && reunioes.length > 0) {
              let listaFormatada = reunioes.map(r => {
                  const tipo = r.tipo_compromisso || "Compromisso"; 
                  const pessoa = r.pessoa || "N/A";
                  const dataHora = r.data_hora ? dayjs(r.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm') : "Data/Hora inválida";
                  return `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} com ${pessoa} em ${dataHora}`;
              }).join("\n");
              mensagemParaFrontend = await gerarRespostaConversacional(`Aqui estão seus compromissos:\n${listaFormatada}\nAlgo mais?`);
            } else {
              mensagemParaFrontend = await gerarRespostaConversacional("Você não tem nenhum compromisso agendado no momento.");
            }
            break;

        case "cancelar_reuniao":
            let idParaCancelar = dadosComando.id_reuniao;
            if (idParaCancelar && (typeof idParaCancelar !== 'number' || !Number.isInteger(idParaCancelar) || idParaCancelar <= 0)) {
                mensagemParaFrontend = await gerarRespostaConversacional(`O ID "${idParaCancelar}" não é válido. Forneça um ID numérico ou descreva o compromisso.`);
                break;
            }
            
            if (!idParaCancelar) {
                const { pessoa_alvo, data_alvo, horario_alvo, tipo_compromisso_alvo } = dadosComando;
                if (pessoa_alvo && data_alvo && horario_alvo) {
                    const dataHoraAlvoUTC = interpretarDataHoraComDayjs(data_alvo, horario_alvo);
                    if (dataHoraAlvoUTC) {
                        let query = supabase.from('reunioes').select('id, pessoa, data_hora, tipo_compromisso')
                            .eq('data_hora', dataHoraAlvoUTC.toISOString()).ilike('pessoa', `%${pessoa_alvo}%`);
                        if (tipo_compromisso_alvo) query = query.ilike('tipo_compromisso', `%${tipo_compromisso_alvo}%`);
                        
                        const { data: encontradas, error: errBusca } = await query;
                        if (errBusca) { console.error("Supabase err busca cancelar:", errBusca); throw errBusca; }
                        
                        if (encontradas && encontradas.length === 1) idParaCancelar = encontradas[0].id;
                        else if (encontradas && encontradas.length > 1) {
                            let listaAmbigua = encontradas.map(r => `${r.tipo_compromisso || 'Comp.'} com ${r.pessoa || 'N/A'} ${dayjs(r.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM HH:mm')} (ID: ${r.id})`).join("\n");
                            mensagemParaFrontend = await gerarRespostaConversacional(`Encontrei vários:\n${listaAmbigua}\nQual ID quer cancelar?`);
                            break;
                        } else {
                            mensagemParaFrontend = await gerarRespostaConversacional(`Não achei compromisso com ${pessoa_alvo} para ${data_alvo} às ${horario_alvo}.`);
                            break;
                        }
                    } else {
                        mensagemParaFrontend = await gerarRespostaConversacional(`Não entendi data/hora ("${data_alvo}" às "${horario_alvo}") para cancelar.`);
                        break;
                    }
                } else {
                     mensagemParaFrontend = await gerarRespostaConversacional(`Para cancelar sem ID, preciso de pessoa, data e hora. Você forneceu: ${dadosComando.mensagem_clarificacao_necessaria || 'detalhes incompletos'}.`);
                     break;
                }
            }

            if (idParaCancelar && Number.isInteger(idParaCancelar) && idParaCancelar > 0) {
                const { data: reuniaoCanc, error: errBuscaId } = await supabase.from('reunioes').select('pessoa, data_hora, tipo_compromisso').eq('id', idParaCancelar).single();
                if (errBuscaId || !reuniaoCanc) {
                    mensagemParaFrontend = await gerarRespostaConversacional(`Não achei compromisso com ID ${idParaCancelar}.`);
                    break;
                }
                const { error: errDelete } = await supabase.from('reunioes').delete().match({ id: idParaCancelar });
                if (errDelete) { console.error("Supabase err delete:", errDelete); throw errDelete; }
                
                const tipoCanc = reuniaoCanc.tipo_compromisso || "compromisso";
                const pessoaCanc = reuniaoCanc.pessoa || "alguém";
                const dataHoraCanc = reuniaoCanc.data_hora ? dayjs(reuniaoCanc.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm') : "data/hora desconhecida";
                const infoCanc = `${tipoCanc} com ${pessoaCanc} de ${dataHoraCanc}`;
                mensagemParaFrontend = await gerarRespostaConversacional(`${infoCanc} foi cancelado com sucesso.`);
            } else if (!mensagemParaFrontend) { 
                mensagemParaFrontend = await gerarRespostaConversacional(`Não identifiquei o compromisso para cancelar. Forneça um ID ou detalhes claros.`);
            }
            break;

        case "alterar_reuniao":
            let idParaAlterar = dadosComando.id_reuniao;
            const { pessoa_alvo, data_alvo, horario_alvo, tipo_compromisso_alvo, 
                    pessoa_alteracao, data_alteracao, horario_alteracao, tipo_compromisso_alteracao 
                  } = dadosComando;

            if (idParaAlterar && (typeof idParaAlterar !== 'number' || !Number.isInteger(idParaAlterar) || idParaAlterar <= 0)) {
                mensagemParaFrontend = await gerarRespostaConversacional(`O ID "${idParaAlterar}" para alterar não é válido.`);
                break;
            }

            if (!idParaAlterar) {
                if (pessoa_alvo && data_alvo && horario_alvo) {
                    const dataHoraOriginalUTC = interpretarDataHoraComDayjs(data_alvo, horario_alvo);
                    if (dataHoraOriginalUTC) {
                        let queryBuscaOriginal = supabase.from('reunioes').select('id, pessoa, data_hora, tipo_compromisso')
                            .eq('data_hora', dataHoraOriginalUTC.toISOString()).ilike('pessoa', `%${pessoa_alvo}%`);
                        if (tipo_compromisso_alvo) queryBuscaOriginal = queryBuscaOriginal.ilike('tipo_compromisso', `%${tipo_compromisso_alvo}%`);
                        
                        const { data: originais, error: errOrig } = await queryBuscaOriginal;
                        if (errOrig) { console.error("Supabase err busca original:", errOrig); throw errOrig; }

                        if (originais && originais.length === 1) idParaAlterar = originais[0].id;
                        else if (originais && originais.length > 1) {
                            let listaAmbigua = originais.map(r => `${r.tipo_compromisso || 'Comp.'} com ${r.pessoa || 'N/A'} ${dayjs(r.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM HH:mm')} (ID: ${r.id})`).join("\n");
                            mensagemParaFrontend = await gerarRespostaConversacional(`Encontrei vários para alterar:\n${listaAmbigua}\nQual ID?`);
                            break;
                        } else {
                            mensagemParaFrontend = await gerarRespostaConversacional(`Não achei compromisso com ${pessoa_alvo} (${data_alvo} ${horario_alvo}) para alterar.`);
                            break;
                        }
                    } else {
                        mensagemParaFrontend = await gerarRespostaConversacional(`Não entendi data/hora do compromisso original ("${data_alvo}" "${horario_alvo}").`);
                        break;
                    }
                } else {
                    mensagemParaFrontend = await gerarRespostaConversacional(`Para alterar sem ID, preciso de pessoa, data e hora do compromisso original. Faltou: ${dadosComando.mensagem_clarificacao_necessaria || 'detalhes'}.`);
                    break;
                }
            }
            
            if (!idParaAlterar || !Number.isInteger(idParaAlterar) || idParaAlterar <= 0) {
                 if (!mensagemParaFrontend) mensagemParaFrontend = await gerarRespostaConversacional("Não consegui identificar o compromisso para alterar. Forneça um ID.");
                 break;
            }

            if (!pessoa_alteracao && !tipo_compromisso_alteracao &&
                (!data_alteracao || data_alteracao === "manter") && 
                (!horario_alteracao || horario_alteracao === "manter")) {
                mensagemParaFrontend = await gerarRespostaConversacional(`O que você gostaria de alterar no compromisso ID ${idParaAlterar}? Preciso dos novos detalhes.`);
                break;
            }

            const { data: reuniaoAtual, error: errBuscaAtual } = await supabase.from('reunioes')
                .select('pessoa, data_hora, tipo_compromisso').eq('id', idParaAlterar).single();
            if (errBuscaAtual || !reuniaoAtual) {
                mensagemParaFrontend = await gerarRespostaConversacional(`Não encontrei o compromisso ID ${idParaAlterar} para buscar os dados atuais.`);
                break;
            }

            const dadosUpdate = {};
            let novaDataHoraUTC;

            const horarioOriginalFormatado = dayjs(reuniaoAtual.data_hora).tz(TIMEZONE_REFERENCIA).format('HH:mm');
            const dataOriginalFormatada = dayjs(reuniaoAtual.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY');

            if (data_alteracao && data_alteracao !== "manter" && horario_alteracao && horario_alteracao !== "manter") {
                novaDataHoraUTC = interpretarDataHoraComDayjs(data_alteracao, horario_alteracao);
                if (!novaDataHoraUTC) { mensagemParaFrontend = await gerarRespostaConversacional(`Nova data/hora ("${data_alteracao}" "${horario_alteracao}") inválida.`); break; }
            } else if (data_alteracao && data_alteracao !== "manter") {
                const horarioParaUsar = horario_alteracao === "manter" ? horarioOriginalFormatado : horario_alteracao;
                if (!horarioParaUsar) { mensagemParaFrontend = await gerarRespostaConversacional(`Preciso do novo horário ou que seja mantido para alterar a data.`); break; }
                novaDataHoraUTC = interpretarDataHoraComDayjs(data_alteracao, horarioParaUsar);
                if (!novaDataHoraUTC) { mensagemParaFrontend = await gerarRespostaConversacional(`Nova data ("${data_alteracao}") com horário ("${horarioParaUsar}") inválida.`); break; }
            } else if (horario_alteracao && horario_alteracao !== "manter") {
                const dataParaUsar = data_alteracao === "manter" ? dataOriginalFormatada : data_alteracao;
                 if (!dataParaUsar) { mensagemParaFrontend = await gerarRespostaConversacional(`Preciso da nova data ou que seja mantida para alterar o horário.`); break; }
                novaDataHoraUTC = interpretarDataHoraComDayjs(dataParaUsar, horario_alteracao);
                if (!novaDataHoraUTC) { mensagemParaFrontend = await gerarRespostaConversacional(`Novo horário ("${horario_alteracao}") com data ("${dataParaUsar}") inválido.`); break; }
            }

            if (novaDataHoraUTC) {
                if (novaDataHoraUTC.isBefore(dayjs.utc().subtract(1, 'minute'))) {
                    mensagemParaFrontend = await gerarRespostaConversacional(`Nova data/hora ${novaDataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')} está no passado.`);
                    break;
                }
                dadosUpdate.data_hora = novaDataHoraUTC.toISOString();
            }

            if (pessoa_alteracao) dadosUpdate.pessoa = pessoa_alteracao;
            if (tipo_compromisso_alteracao) dadosUpdate.tipo_compromisso = tipo_compromisso_alteracao;

            if (Object.keys(dadosUpdate).length === 0) {
                mensagemParaFrontend = await gerarRespostaConversacional(`Nenhuma alteração válida foi especificada para o compromisso ID ${idParaAlterar}.`);
                break;
            }
            
            const { data: reuniaoAlterada, error: erroUpdate } = await supabase.from('reunioes')
                .update(dadosUpdate).match({ id: idParaAlterar }).select().single();
            if (erroUpdate || !reuniaoAlterada) {
                console.error("Supabase erro update:", erroUpdate);
                mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui alterar o compromisso ID ${idParaAlterar}.`);
                break;
            }

            const pessoaAntiga = reuniaoAtual.pessoa || "N/A";
            const tipoAntigo = reuniaoAtual.tipo_compromisso || "Comp.";
            const dataHoraAntiga = dayjs(reuniaoAtual.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YY HH:mm');
            const infoAntiga = `${tipoAntigo} com ${pessoaAntiga} de ${dataHoraAntiga}`;
            
            const pessoaNova = reuniaoAlterada.pessoa || "N/A";
            const tipoNovo = reuniaoAlterada.tipo_compromisso || "Comp.";
            const dataHoraNova = dayjs(reuniaoAlterada.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YY HH:mm');
            const infoNova = `${tipoNovo} com ${pessoaNova} em ${dataHoraNova}`;
            
            mensagemParaFrontend = await gerarRespostaConversacional(`OK! ${infoAntiga} foi alterado para ${infoNova}.`);
            break;

        default:
          mensagemParaFrontend = await gerarRespostaConversacional(`Não entendi o pedido: "${comando}". Poderia tentar de outra forma?`);
          break;
      }
    } else {
        console.error("Backend (v38): 'intencao' inválida ou ausente.", dadosComando); 
        mensagemParaFrontend = await gerarRespostaConversacional(`Não determinei sua intenção em "${comando}". Poderia reformular?`);
    }
    
    if (typeof mensagemParaFrontend !== 'string' || !mensagemParaFrontend.trim()) {
        console.warn("Backend (v38): mensagemParaFrontend vazia/inválida no final. Usando fallback."); 
        mensagemParaFrontend = "Não consegui processar seu pedido completamente. Tente novamente.";
    }
    return res.status(200).json({ mensagem: mensagemParaFrontend });

  } catch (error) {
    console.error("Backend (v38): Erro GERAL:", error, "\nComando:", comando, "\nDadosExtraidos:", JSON.stringify(dadosComando, null, 2)); 
    const respostaErroIA = await gerarRespostaConversacional(`Desculpe, um erro técnico inesperado ocorreu com "${comando}". Registrei para análise. Tente mais tarde ou reformule.`);
    return res.status(500).json({ mensagem: respostaErroIA });
  }
} // Fim da função handler
