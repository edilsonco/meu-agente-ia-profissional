// Importações necessárias
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
// Importar funções de date-fns
import { parse, format, addDays, setHours, setMinutes, setSeconds, setMilliseconds, isValid } from 'date-fns';
// Importar locale ptBR
import { ptBR } from 'date-fns/locale'; 
// Tentar importar diretamente as funções de date-fns-tz
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'; 

// --- Configuração das Chaves de API ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

// --- Inicialização dos Clientes ---
let openai;
if (OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });
} else {
  console.warn("Chave da API OpenAI não configurada.");
}

let supabase;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn("Credenciais do Supabase não configuradas.");
}

// --- Função Auxiliar para Interpretar Data e Hora ---
async function interpretarDataHora(dataRelativa, horarioTexto) { 
  if (!dataRelativa || !horarioTexto) {
    console.error("interpretarDataHora: Data ou Horário em falta.", { dataRelativa, horarioTexto });
    return null;
  }

  const timeZone = 'America/Sao_Paulo'; 
  
  // Verificar se as funções foram importadas corretamente (debug)
  if (typeof utcToZonedTime !== 'function' || typeof zonedTimeToUtc !== 'function') {
      console.error("Erro Crítico: Funções utcToZonedTime ou zonedTimeToUtc não foram importadas corretamente de date-fns-tz.");
      return null; // Falha imediatamente se a importação falhou
  }

  const agoraEmSaoPaulo = utcToZonedTime(new Date(), timeZone); 
  console.log("interpretarDataHora: Agora em São Paulo:", agoraEmSaoPaulo);

  let dataBase = agoraEmSaoPaulo; 
  const dataNorm = dataRelativa.toLowerCase();

  // --- Processar a Data ---
  if (dataNorm === "hoje") {
    // OK
  } else if (dataNorm === "amanhã" || dataNorm === "amanha") {
    dataBase = addDays(dataBase, 1);
  } else {
    let dataParseada = null;
    try {
      if (dataNorm.match(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/)) {
         const partes = dataNorm.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
         if (partes) {
             const dia = parseInt(partes[1], 10);
             const mes = parseInt(partes[2], 10) -1; 
             let ano = parseInt(partes[3], 10);
             if (partes[3].length === 2) ano += 2000; 
             dataParseada = new Date(Date.UTC(ano, mes, dia)); 
             console.log("interpretarDataHora: Data parseada (DD/MM/YYYY) como UTC:", dataParseada);
             if (!isValid(dataParseada)) dataParseada = null; 
         }
      } 
      else if (dataNorm.includes(" de ")) {
          console.log("interpretarDataHora: Tentando parse 'DD de MMMM' com locale ptBR...");
          let dataTentativa = parse(dataRelativa, 'dd MMMM', new Date(), { locale: ptBR });
          console.log("interpretarDataHora: Resultado parse 'dd MMMM':", dataTentativa);
          if (isValid(dataTentativa)) {
              const dataParseadaSP = utcToZonedTime(dataTentativa, timeZone); 
              if (dataParseadaSP.getMonth() < agoraEmSaoPaulo.getMonth() || (dataParseadaSP.getMonth() === agoraEmSaoPaulo.getMonth() && dataParseadaSP.getDate() < agoraEmSaoPaulo.getDate())) {
                  dataParseada = new Date(Date.UTC(agoraEmSaoPaulo.getFullYear() + 1, dataTentativa.getUTCMonth(), dataTentativa.getUTCDate()));
                  console.log("interpretarDataHora: Data 'DD de MMMM' ajustada para próximo ano:", dataParseada);
              } else {
                  dataParseada = new Date(Date.UTC(agoraEmSaoPaulo.getFullYear(), dataTentativa.getUTCMonth(), dataTentativa.getUTCDate()));
                  console.log("interpretarDataHora: Data 'DD de MMMM' mantida no ano corrente:", dataParseada);
              }
          } else {
              dataTentativa = parse(dataRelativa, 'dd MMMM<y_bin_46>', new Date(), { locale: ptBR }); 
              console.log("interpretarDataHora: Resultado parse 'dd MMMM<y_bin_46>':", dataTentativa);
              if (isValid(dataTentativa)) {
                   dataParseada = new Date(Date.UTC(dataTentativa.getFullYear(), dataTentativa.getUTCMonth(), dataTentativa.getUTCDate()));
                   console.log("interpretarDataHora: Data 'dd MMMM<y_bin_46>' parseada:", dataParseada);
              }
          }
          if (!isValid(dataParseada)) dataParseada = null; 
      }
      
      if (dataParseada) {
         dataBase = new Date(Date.UTC(
            dataParseada.getUTCFullYear(), 
            dataParseada.getUTCMonth(), 
            dataParseada.getUTCDate(),
            agoraEmSaoPaulo.getHours(), 
            agoraEmSaoPaulo.getMinutes(),
            agoraEmSaoPaulo.getSeconds()
         ));
         console.log("interpretarDataHora: dataBase (UTC) atualizada com data parseada:", dataBase);
         dataBase = utcToZonedTime(dataBase, timeZone);
         console.log("interpretarDataHora: dataBase convertida para SP para aplicar hora:", dataBase);

      } else if (dataNorm !== "hoje" && dataNorm !== "amanhã" && dataNorm !== "amanha") {
          console.error("interpretarDataHora: Formato de data não reconhecido:", dataRelativa);
          return null;
      }

    } catch (e) {
      console.error("interpretarDataHora: Erro ao fazer parse da data:", dataRelativa, e);
      return null;
    }
  }

  // --- Processar o Horário ---
  let horas = 0;
  let minutos = 0;
  const matchHorario = horarioTexto.match(/(\d{1,2})(?:h|:)?(\d{0,2})?/i);
  if (matchHorario) {
    horas = parseInt(matchHorario[1], 10);
    minutos = matchHorario[2] ? parseInt(matchHorario[2], 10) : 0;
    if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
      console.error("interpretarDataHora: Horas ou minutos inválidos:", horarioTexto);
      return null;
    }
  } else {
    console.error("interpretarDataHora: Formato de horário não reconhecido:", horarioTexto);
    return null;
  }

  // --- Combinar Data e Hora ---
  let dataHoraFinalEmSaoPaulo;
  try {
    dataHoraFinalEmSaoPaulo = setHours(dataBase, horas);
    dataHoraFinalEmSaoPaulo = setMinutes(dataHoraFinalEmSaoPaulo, minutos);
    dataHoraFinalEmSaoPaulo = setSeconds(dataHoraFinalEmSaoPaulo, 0);
    dataHoraFinalEmSaoPaulo = setMilliseconds(dataHoraFinalEmSaoPaulo, 0);
    console.log("interpretarDataHora: Data/Hora final em São Paulo:", dataHoraFinalEmSaoPaulo);
    if(!isValid(dataHoraFinalEmSaoPaulo)) throw new Error("Data/Hora inválida após setar H/M");

  } catch (e) {
      console.error("interpretarDataHora: Erro ao combinar data e hora:", e);
      return null;
  }


  // --- Converter para UTC para guardar no Supabase ---
  const dataHoraFinalUTC = zonedTimeToUtc(dataHoraFinalEmSaoPaulo, timeZone);
  console.log("interpretarDataHora: Data/Hora final em UTC para Supabase:", dataHoraFinalUTC);
  if(!isValid(dataHoraFinalUTC)) {
      console.error("interpretarDataHora: Data UTC final inválida.");
      return null;
  }

  return dataHoraFinalUTC;
}


// --- Função Principal da Serverless Function (Handler da Vercel) ---
export default async function handler(req, res) { 
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ mensagem: `Método ${req.method} não permitido.` });
  }

  const { comando } = req.body;

  if (!comando) {
    return res.status(400).json({ mensagem: "Nenhum comando fornecido." });
  }

  console.log("Backend: Comando recebido:", comando);

  if (!openai) {
    return res.status(500).json({ mensagem: "Erro de configuração: API da OpenAI não inicializada no servidor." });
  }
  if (!supabase) {
    return res.status(500).json({ mensagem: "Erro de configuração: Supabase não inicializado no servidor." });
  }

  try {
    console.log("Backend: A chamar a API da OpenAI...");
    
    const promptParaOpenAI = `
      Analise o seguinte comando de um utilizador para um assistente de agendamento, considerando que a data/hora atual é ${new Date().toISOString()} e o fuso horário de referência é America/Sao_Paulo:
      "${comando}"

      Extraia as seguintes informações em formato JSON:
      - intencao: Qual a intenção principal? (ex: "marcar_reuniao", "listar_reunioes", "cancelar_reuniao", "alterar_reuniao", "desconhecida")
      - pessoa: Nome da pessoa para a reunião (string ou null).
      - data_relativa: Data como mencionada pelo utilizador (ex: "hoje", "amanhã", "15/05/2025", "10 de junho", null). Use o formato original mencionado.
      - horario_texto: Horário como mencionado (ex: "15 horas", "10h30", "9h", null). Use o formato original mencionado.
      - id_reuniao: Se a intenção for cancelar ou alterar, qual o ID da reunião mencionado (inteiro ou null)?
      - detalhes_adicionais: Qualquer outra informação relevante (string ou null).
      
      Se uma informação não for claramente mencionada, use null.
      Responda APENAS com o objeto JSON. Não adicione explicações.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", 
      messages: [{ role: "user", content: promptParaOpenAI }],
      response_format: { type: "json_object" }, 
    });

    let interpretacaoComando;
    if (completion.choices[0].message.content) {
        try {
            interpretacaoComando = JSON.parse(completion.choices[0].message.content);
        } catch (e) {
            console.error("Backend: Erro ao fazer parse da resposta JSON da OpenAI:", e);
            console.error("Backend: Resposta bruta da OpenAI:", completion.choices[0].message.content);
            return res.status(500).json({ mensagem: "Erro ao interpretar a resposta da IA." });
        }
    } else {
        console.error("Backend: Resposta da OpenAI não contém conteúdo.");
        return res.status(500).json({ mensagem: "A IA não forneceu uma resposta válida." });
    }
    
    console.log("Backend: Interpretação da OpenAI:", interpretacaoComando);

    // --- ETAPA 2: Processar a intenção e interagir com o Supabase ---
    let mensagemParaFrontend = "Comando processado."; 
    const timeZoneDisplay = 'America/Sao_Paulo'; 

    switch (interpretacaoComando.intencao) {
      case "marcar_reuniao":
        if (interpretacaoComando.pessoa && interpretacaoComando.data_relativa && interpretacaoComando.horario_texto) {
          
          const dataHoraUTC = await interpretarDataHora(interpretacaoComando.data_relativa, interpretacaoComando.horario_texto); 

          if (!dataHoraUTC) {
             mensagemParaFrontend = `Não consegui interpretar a data "${interpretacaoComando.data_relativa}" ou o horário "${interpretacaoComando.horario_texto}". Pode tentar um formato diferente?`;
          } else {
             const agoraUTC = new Date();
             if (dataHoraUTC < agoraUTC) {
                 const margemMinutosValidacao = -2; 
                 const agoraComMargemValidacao = new Date(agoraUTC.getTime() + margemMinutosValidacao * 60000); 
                 if (dataHoraUTC < agoraComMargemValidacao) {
                    // Verificar novamente se a função está disponível antes de usar
                    if (typeof utcToZonedTime !== 'function') return res.status(500).json({ mensagem: "Erro interno: função de fuso horário indisponível." });
                    const dataHoraInvalidaFormatada = format(utcToZonedTime(dataHoraUTC, timeZoneDisplay), 'dd/MM/yyyy HH:mm', { timeZone: timeZoneDisplay });
                    mensagemParaFrontend = `Não é possível marcar reuniões no passado (${dataHoraInvalidaFormatada}).`;
                    return res.status(400).json({ mensagem: mensagemParaFrontend }); 
                 }
             }
             
             const dataHoraSupabase = dataHoraUTC.toISOString(); 

             console.log("Backend: A tentar inserir no Supabase:", { 
                pessoa: interpretacaoComando.pessoa, 
                data_hora: dataHoraSupabase, 
                descricao_comando: comando 
             });

             const { data, error } = await supabase
                .from('reunioes') 
                .insert([
                  { 
                    pessoa: interpretacaoComando.pessoa, 
                    data_hora: dataHoraSupabase, 
                    descricao_comando: comando 
                  },
                ])
                .select(); 

             if (error) {
                console.error("Backend: Erro ao inserir no Supabase:", error);
                mensagemParaFrontend = `Erro ao marcar reunião na base de dados: ${error.message}`;
             } else {
                console.log("Backend: Reunião inserida no Supabase:", data);
                if (typeof utcToZonedTime !== 'function') return res.status(500).json({ mensagem: "Erro interno: função de fuso horário indisponível para formatar resposta." });
                const dataHoraConfirmacao = format(utcToZonedTime(dataHoraUTC, timeZoneDisplay), 'dd/MM/yyyy HH:mm', { timeZone: timeZoneDisplay });
                mensagemParaFrontend = `Reunião com ${interpretacaoComando.pessoa} marcada para ${dataHoraConfirmacao}.`;
             }
          }
        } else {
          mensagemParaFrontend = "Não consegui obter todos os detalhes (pessoa, data, hora) da IA para marcar a reunião.";
        }
        break;

      case "listar_reunioes":
        console.log("Backend: A listar reuniões do Supabase...");
        const { data: reunioes, error: erroListagem } = await supabase
          .from('reunioes')
          .select('id, pessoa, data_hora, descricao_comando') 
          .order('data_hora', { ascending: true });

        if (erroListagem) {
          console.error("Backend: Erro ao listar reuniões do Supabase:", erroListagem);
          mensagemParaFrontend = `Erro ao buscar reuniões: ${erroListagem.message}`;
        } else if (reunioes && reunioes.length > 0) {
          mensagemParaFrontend = "Suas reuniões agendadas:\n";
          if (typeof utcToZonedTime !== 'function') return res.status(500).json({ mensagem: "Erro interno: função de fuso horário indisponível para listar." });
          reunioes.forEach(r => {
            const dataHoraFormatada = r.data_hora ? format(utcToZonedTime(new Date(r.data_hora), timeZoneDisplay), 'dd/MM/yyyy HH:mm', { timeZone: timeZoneDisplay }) : 'Data/Hora inválida';
            mensagemParaFrontend += `- (ID: ${r.id}) Com ${r.pessoa} em ${dataHoraFormatada}\n`; 
          });
        } else {
          mensagemParaFrontend = "Você não tem nenhuma reunião agendada.";
        }
        break;
      
      default:
        mensagemParaFrontend = "Não entendi bem o seu pedido. Pode tentar de outra forma?";
        if (interpretacaoComando.intencao === "desconhecida" && interpretacaoComando.detalhes_adicionais) {
            mensagemParaFrontend += ` Detalhe: ${interpretacaoComando.detalhes_adicionais}`;
        }
        break;
    }

    console.log("Backend: A enviar resposta para o frontend:", mensagemParaFrontend);
    return res.status(200).json({ mensagem: mensagemParaFrontend });

  } catch (error) {
    console.error("Backend: Erro geral no processamento do comando:", error);
    let mensagemErro = "Ocorreu um erro inesperado no servidor.";
    if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
        mensagemErro = `Erro da IA: ${error.response.data.error.message}`;
    } else if (error.message) {
        mensagemErro = error.message;
    }
    // Adiciona verificação específica para o erro de função
    if (error instanceof TypeError && error.message.includes("is not a function")) {
        mensagemErro = `Erro de tipo: ${error.message}. Verifique as importações e uso das funções.`;
    }
    return res.status(500).json({ mensagem: mensagemErro });
  }
}
