from flask import Flask, request, jsonify
from transformers import pipeline
import os
import torch

# Desativa um aviso de paralelismo do tokenizers que pode poluir o log
os.environ["TOKENIZERS_PARALLELISM"] = "false"

app = Flask(__name__)

# --- CARREGAMENTO DO MODELO ---
# Certifique-se de que este caminho está correto em relação a onde você executa o servidor
MODELO_PATH = "./checkpoint-657"

try:
    print(f"Carregando o modelo do caminho: {MODELO_PATH}...")
    # É recomendado especificar 'cpu' se você não tiver uma GPU configurada
    # para evitar possíveis erros de alocação de memória.
    # Se você tiver uma GPU com CUDA, pode remover device=-1.
    classificador = pipeline(
        "text-classification",
        model=MODELO_PATH,
        device=-1 # Força o uso da CPU
    )
    print("Modelo carregado com sucesso!")
except Exception as e:
    print(f"ERRO CRÍTICO AO CARREGAR O MODELO: {e}")
    print("Verifique se o caminho do modelo está correto e se as dependências (PyTorch, Transformers) estão instaladas.")
    classificador = None

# --- ENDPOINT DE CLASSIFICAÇÃO ---
@app.route('/classificar', methods=['POST'])
def classificar_frase():
    if not classificador:
        return jsonify({"erro": "O modelo não foi carregado corretamente. Verifique os logs do servidor."}), 500

    dados = request.get_json()
    if not dados or 'frase' not in dados:
        return jsonify({"erro": "A chave 'frase' é obrigatória no corpo da requisição."}), 400

    frase = dados['frase']

    try:
        resultado = classificador(frase)
        # O modelo retorna uma lista, pegamos o primeiro (e único) resultado
        predicao = resultado[0]
        resposta = {
            "tema": predicao['label'],
            "confianca": predicao['score']
        }
        return jsonify(resposta)
    except Exception as e:
        return jsonify({"erro": f"Erro ao processar a frase: {e}"}), 500

if __name__ == '__main__':
    # Use 0.0.0.0 para tornar o servidor acessível na sua rede local
    # Mude para '127.0.0.1' se quiser que seja acessível apenas na sua máquina
    app.run(host='0.0.0.0', port=5000, debug=True)
