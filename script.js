const canvas = document.getElementById("mappaCanvas");
const ctx = canvas.getContext("2d");
const canvasStatus = document.getElementById("canvasStatus");
const dimensioniCanvas = document.getElementById("dimensioniCanvas");
const sintesiLista = document.getElementById("sintesiLista");
const dataAggiornamento = document.getElementById("dataAggiornamento");

if (dataAggiornamento) {
    const formatter = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long' });
    dataAggiornamento.textContent = formatter.format(new Date());
}

// --- Strutture Dati ---
let sorgenti = [];
let recettori = [];
let barriere = [];
let img = null;

// Variabili per il disegno delle barriere
let isDrawingBarrier = false;
let startPoint = null;

aggiornaMetadatiCanvas();

// --- Gestione Eventi ---

// Caricamento planimetria
document.getElementById("uploadImg").addEventListener("change", function (e) {
    if (e.target.files.length === 0) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        img = new Image();
        img.onload = () => {
            aggiornaStatus("Planimetria caricata", "success");
            simula();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
});

// Input che aggiornano automaticamente la simulazione
[...document.querySelectorAll('#controlliForm input, #controlliForm select')]
    .filter(el => el.type !== 'file' && el.name !== 'modalita')
    .forEach(el => {
        el.addEventListener('input', () => simula());
        el.addEventListener('change', () => simula());
    });

document.querySelectorAll('input[name="modalita"]').forEach(radio => {
    radio.addEventListener('change', () => {
        if (radio.checked) {
            const modo = radio.value;
            const messaggio = modo === 'sorgente'
                ? 'Modalità: aggiunta sorgenti sonore'
                : modo === 'recettore'
                    ? 'Modalità: inserimento recettori'
                    : 'Modalità: disegno barriere antirumore';
            aggiornaStatus(messaggio, 'info');
        }
    });
});

// Click sul canvas per aggiungere elementi
canvas.addEventListener("click", function (e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const mode = document.querySelector('input[name="modalita"]:checked').value;

    if (mode === 'recettore') {
        recettori.push({ x, y });
        aggiornaStatus(`Recettore posizionato alle coordinate (${x.toFixed(0)}, ${y.toFixed(0)})`, 'success');
    } else if (mode === 'sorgente') {
        const nome = document.getElementById("nomeSorgente").value || "Sorgente";
        const potenza = parseFloat(document.getElementById("potenza").value) || 0;
        const altezza = parseFloat(document.getElementById("altezzaSorgente").value) || 0;
        const tipoPropagazione = document.getElementById("tipoPropagazione").value;

        sorgenti.push({ x, y, nome, potenza, altezza, tipoPropagazione });
        document.getElementById("nomeSorgente").value = nome.replace(/\d+$/, (n) => parseInt(n) + 1);
        aggiornaStatus(`Sorgente "${nome}" aggiunta in posizione (${x.toFixed(0)}, ${y.toFixed(0)})`, 'success');
    } else if (mode === 'barriera') {
        if (!isDrawingBarrier) {
            startPoint = { x, y };
            isDrawingBarrier = true;
            drawElements(parseFloat(document.getElementById("scalaPx").value) || 1);
            ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
            aggiornaStatus('Punto iniziale barriera registrato', 'info');
        } else {
            barriere.push({ p1: startPoint, p2: { x, y } });
            isDrawingBarrier = false;
            startPoint = null;
            aggiornaStatus('Barriera completata', 'success');
        }
    }
    simula();
});

// --- Funzione Principale di Simulazione ---

function simula() {
    const scala = parseFloat(document.getElementById("scalaPx").value) || 1;
    const attenuazioneBarriera = parseFloat(document.getElementById("attenuazioneBarriera").value) || 0;

    aggiornaMetadatiCanvas(scala);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    const colori = [
        { min: 90, max: Infinity, color: "rgba(255,0,0,0.35)", label: "> 90 dB" },
        { min: 80, max: 90, color: "rgba(255,165,0,0.35)", label: "80–90 dB" },
        { min: 70, max: 80, color: "rgba(255,255,0,0.35)", label: "70–80 dB" },
        { min: 60, max: 70, color: "rgba(144,238,144,0.35)", label: "60–70 dB" },
        { min: 50, max: 60, color: "rgba(56,189,248,0.35)", label: "50–60 dB" },
        { min: 0,  max: 50,  color: "rgba(99,102,241,0.25)", label: "< 50 dB" }
    ];

    if (sorgenti.length > 0) {
        const step = 10;
        for (let x = 0; x < canvas.width; x += step) {
            for (let y = 0; y < canvas.height; y += step) {
                const livelloTotale = calcolaLivelloPunto(x, y, scala, attenuazioneBarriera);
                const fascia = colori.find(c => livelloTotale >= c.min && livelloTotale < c.max);
                if (fascia) {
                    ctx.fillStyle = fascia.color;
                    ctx.fillRect(x, y, step, step);
                }
            }
        }
    }

    drawElements(scala);
    updateLegenda(colori);
    aggiornaSintesi(scala, attenuazioneBarriera);
}

// --- Funzioni di Calcolo e Disegno ---

function calcolaLivelloPunto(x, y, scala, attBarriera) {
    let sommaEnergetica = 0;

    sorgenti.forEach(s => {
        const dx = (x - s.x) * scala;
        const dy = (y - s.y) * scala;
        const distanza = Math.max(1, Math.sqrt(dx * dx + dy * dy));

        let attenuazione = s.tipoPropagazione === "sferica"
            ? 20 * Math.log10(distanza) + 11
            : 20 * Math.log10(distanza) + 8;

        let barrieraPresente = false;
        for (const b of barriere) {
            if (lineSegmentsIntersect(s.x, s.y, x, y, b.p1.x, b.p1.y, b.p2.x, b.p2.y)) {
                barrieraPresente = true;
                break;
            }
        }
        if (barrieraPresente) {
            attenuazione += attBarriera;
        }

        const livello = s.potenza - attenuazione;
        if (!isNaN(livello)) {
            sommaEnergetica += Math.pow(10, livello / 10);
        }
    });

    if (sommaEnergetica === 0) return 0;
    return 10 * Math.log10(sommaEnergetica);
}

function drawElements(scala) {
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 3;
    barriere.forEach(b => {
        ctx.beginPath();
        ctx.moveTo(b.p1.x, b.p1.y);
        ctx.lineTo(b.p2.x, b.p2.y);
        ctx.stroke();
    });

    sorgenti.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 10, 0, 2 * Math.PI);
        ctx.fillStyle = "#111827";
        ctx.fill();
        ctx.fillStyle = "#f8fafc";
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.nome, s.x, s.y);
    });

    const attBarriera = parseFloat(document.getElementById("attenuazioneBarriera").value) || 0;
    recettori.forEach((r, i) => {
        const livello = calcolaLivelloPunto(r.x, r.y, scala, attBarriera);
        ctx.beginPath();
        ctx.arc(r.x, r.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = "#2563eb";
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.font = "12px 'Roboto', Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(`R${i + 1}: ${livello.toFixed(1)} dB`, r.x + 12, r.y);
    });
}

function updateLegenda(colori) {
    const legendaDiv = document.getElementById("legenda");
    legendaDiv.innerHTML = colori.map(c =>
        `<div><span style="background:${c.color}"></span>${c.label}</div>`
    ).join("");
}

// --- Dashboard sintetica ---

function aggiornaSintesi(scala, attBarriera) {
    if (!sintesiLista) return;

    const totaleSorgenti = sorgenti.length;
    const totaleRecettori = recettori.length;
    const totaleBarriere = barriere.length;

    const recettoriConLivello = recettori.map((r, index) => ({
        id: `R${index + 1}`,
        livello: calcolaLivelloPunto(r.x, r.y, scala, attBarriera)
    }));

    const maxRecettore = recettoriConLivello.length
        ? recettoriConLivello.reduce((prev, current) => current.livello > prev.livello ? current : prev)
        : null;

    const mediaRecettori = recettoriConLivello.length
        ? recettoriConLivello.reduce((acc, cur) => acc + cur.livello, 0) / recettoriConLivello.length
        : 0;

    const tipologiaPropagazione = sorgenti.reduce((acc, s) => {
        acc[s.tipoPropagazione] = (acc[s.tipoPropagazione] || 0) + 1;
        return acc;
    }, {});

    const righeTipologia = Object.keys(tipologiaPropagazione).length
        ? Object.entries(tipologiaPropagazione)
            .map(([tipo, count]) => `${tipo === 'sferica' ? 'Sferica' : 'Semisferica'}: ${count}`)
            .join(" · ")
        : 'Nessuna sorgente configurata';

    const messaggi = [
        `<strong>Sorgenti attive:</strong> ${totaleSorgenti} ( ${righeTipologia} )`,
        `<strong>Recettori monitorati:</strong> ${totaleRecettori}${maxRecettore ? ` – Valore massimo ${maxRecettore.id} = ${maxRecettore.livello.toFixed(1)} dB` : ''}`,
        `<strong>Livello medio ai recettori:</strong> ${totaleRecettori ? mediaRecettori.toFixed(1) + ' dB' : 'n.d.'}`,
        `<strong>Barriere modellate:</strong> ${totaleBarriere}${totaleBarriere ? ' (influenzano la propagazione quando intersecano il percorso sorgente-recettore)' : ''}`
    ];

    sintesiLista.innerHTML = messaggi.map(msg => `<li>${msg}</li>`).join("");
}

// --- Funzioni Utilità ---

function reset() {
    sorgenti = [];
    recettori = [];
    barriere = [];
    isDrawingBarrier = false;
    startPoint = null;
    document.getElementById("nomeSorgente").value = "S1";
    document.getElementById("uploadImg").value = "";
    img = null;
    aggiornaStatus('Scenario ripristinato', 'info');
    simula();
}

function lineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) return false;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
    return t > 0 && t < 1 && u > 0 && u < 1;
}

function generaPDF() {
    const button = document.querySelector('[data-action="genera-pdf"]');
    if (button) {
        button.textContent = '📄 Creazione PDF in corso...';
        button.disabled = true;
    }

    html2canvas(document.getElementById("mappaCanvas")).then(canvas => {
        const imgData = canvas.toDataURL("image/png");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

        const dataCreazione = new Date().toLocaleDateString('it-IT');
        let finalY = 0;

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text("Rapporto di Valutazione Previsionale Acustica", doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Data di emissione: ${dataCreazione}`, doc.internal.pageSize.getWidth() / 2, 28, { align: 'center' });

        finalY = 40;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text("1. Riferimenti Normativi e Metodologici", 15, finalY);
        finalY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text([
            "- Legge Quadro sull'inquinamento acustico n. 447 del 26 Ottobre 1995.",
            "- D.P.C.M. 14 Novembre 1997: Determinazione dei valori limite delle sorgenti sonore.",
            "- Norma ISO 9613-1/2: 'Acoustics — Attenuation of sound during propagation outdoors'."
        ], 15, finalY);
        finalY += 20;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text("2. Metodologia di Calcolo", 15, finalY);
        finalY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text("Il livello di pressione sonora (Lp) per ogni sorgente è calcolato secondo il modello di propagazione:", 15, finalY);
        finalY += 6;
        doc.setFont('courier', 'bold');
        doc.text("Lp = Lw - A_div - A_bar", 20, finalY);
        finalY += 6;
        doc.setFont('helvetica', 'normal');
        doc.text("Dove:", 20, finalY);
        finalY += 5;
        doc.text("- Lp: Livello di pressione sonora al recettore (dB).", 25, finalY);
        finalY += 5;
        doc.text("- Lw: Livello di potenza sonora della sorgente (dB).", 25, finalY);
        finalY += 5;
        doc.text("- A_div: Attenuazione per divergenza geometrica (20*log10(r) + C), con C=8 o 11.", 25, finalY);
        finalY += 5;
        doc.text("- A_bar: Attenuazione per barriera (dB), se presente.", 25, finalY);
        finalY += 8;
        doc.text("Il livello totale, dato dalla somma energetica di N sorgenti, è calcolato con la formula:", 15, finalY);
        finalY += 6;
        doc.setFont('courier', 'bold');
        doc.text("Lp_tot = 10 * log10( SUM[i=1 to N] ( 10^(Lp_i / 10) ) )", 20, finalY);
        finalY += 15;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text("3. Parametri delle Sorgenti Sonore", 15, finalY);

        const headSorgenti = [['ID', 'Nome', 'Potenza (Lw)', 'Altezza', 'Propagazione', 'Posizione (x, y)']];
        const bodySorgenti = sorgenti.map((s, i) => [
            `S${i + 1}`,
            s.nome,
            `${s.potenza.toFixed(1)} dB`,
            `${s.altezza.toFixed(1)} m`,
            s.tipoPropagazione,
            `${s.x.toFixed(0)}, ${s.y.toFixed(0)}`
        ]);

        doc.autoTable({
            head: headSorgenti,
            body: bodySorgenti,
            startY: finalY + 2,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] }
        });
        finalY = doc.autoTable.previous.finalY + 15;

        if (finalY > 200) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text("4. Risultati della Simulazione", 15, finalY);
        finalY += 8;

        const imgProps = doc.getImageProperties(imgData);
        const pdfWidth = doc.internal.pageSize.getWidth();
        const imgHeight = (imgProps.height * (pdfWidth - 30)) / imgProps.width;
        doc.addImage(imgData, 'PNG', 15, finalY, pdfWidth - 30, imgHeight);
        finalY += imgHeight + 5;

        const scala = parseFloat(document.getElementById("scalaPx").value) || 1;
        const attBarriera = parseFloat(document.getElementById("attenuazioneBarriera").value) || 0;
        const headRecettori = [['ID', 'Posizione (x, y)', 'Livello Calcolato (Lp)']];
        const bodyRecettori = recettori.map((r, i) => {
            const livello = calcolaLivelloPunto(r.x, r.y, scala, attBarriera);
            return [`R${i + 1}`, `${r.x.toFixed(0)}, ${r.y.toFixed(0)}`, `${livello.toFixed(1)} dB`];
        });

        doc.autoTable({
            head: headRecettori,
            body: bodyRecettori,
            startY: finalY,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] }
        });
        finalY = doc.autoTable.previous.finalY + 10;

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(9);
            doc.text(`Pagina ${i} di ${pageCount}`, doc.internal.pageSize.getWidth() - 25, 287);
            doc.text("Report generato con Simulatore Acustico Web", 15, 287);
        }

        doc.save(`Rapporto_Acustico_${new Date().toISOString().slice(0, 10)}.pdf`);
        aggiornaStatus('Report PDF generato correttamente', 'success');
    }).catch(err => {
        console.error("Errore durante la generazione del PDF:", err);
        aggiornaStatus('Errore durante la generazione del PDF', 'error');
    }).finally(() => {
        const button = document.querySelector('[data-action="genera-pdf"]');
        if (button) {
            button.textContent = '📄 Genera PDF';
            button.disabled = false;
        }
    });
}

function aggiornaStatus(messaggio, tipo = 'info') {
    if (!canvasStatus) return;
    canvasStatus.textContent = messaggio;
    canvasStatus.className = 'canvas-card__status';
    if (tipo === 'success') {
        canvasStatus.style.background = 'rgba(34, 197, 94, 0.12)';
        canvasStatus.style.color = '#15803d';
    } else if (tipo === 'error') {
        canvasStatus.style.background = 'rgba(248, 113, 113, 0.15)';
        canvasStatus.style.color = '#b91c1c';
    } else {
        canvasStatus.style.background = 'rgba(59, 130, 246, 0.12)';
        canvasStatus.style.color = '#1d4ed8';
    }
}

function aggiornaMetadatiCanvas(scala = parseFloat(document.getElementById("scalaPx").value) || 1) {
    if (!dimensioniCanvas) return;
    const larghezza = (canvas.width * scala).toFixed(1);
    const altezza = (canvas.height * scala).toFixed(1);
    dimensioniCanvas.textContent = `Dimensioni area analizzata: ${canvas.width} × ${canvas.height} px (≈ ${larghezza} m × ${altezza} m)`;
}

// Esegui la simulazione all'avvio per mostrare una tela coerente
simula();
