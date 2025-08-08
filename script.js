const canvas = document.getElementById("mappaCanvas");
const ctx = canvas.getContext("2d");

// --- Strutture Dati ---
let sorgenti = [];
let recettori = [];
let barriere = [];
let img = null;

// Variabili per il disegno delle barriere
let isDrawingBarrier = false;
let startPoint = null;

// --- Gestione Eventi ---

// Caricamento planimetria
document.getElementById("uploadImg").addEventListener("change", function (e) {
    if (e.target.files.length === 0) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        img = new Image();
        img.onload = () => simula(); // Una volta caricata l'immagine, ricalcola la simulazione
        img.src = event.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
});

// Click sul canvas per aggiungere elementi
canvas.addEventListener("click", function (e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const mode = document.querySelector('input[name="modalita"]:checked').value;

    if (mode === 'recettore') {
        recettori.push({ x, y });
    } else if (mode === 'sorgente') {
        // FIX 1: Aggiunto fallback a 0 per tutti i valori numerici per evitare errori NaN
        const nome = document.getElementById("nomeSorgente").value || "Sorgente";
        const potenza = parseFloat(document.getElementById("potenza").value) || 0;
        const altezza = parseFloat(document.getElementById("altezzaSorgente").value) || 0;
        const tipoPropagazione = document.getElementById("tipoPropagazione").value;
        
        sorgenti.push({ x, y, nome, potenza, altezza, tipoPropagazione });
        
        // Incrementa il nome per la prossima sorgente (es. CASSA 1 -> CASSA 2)
        document.getElementById("nomeSorgente").value = nome.replace(/\d+$/, (n) => parseInt(n) + 1);
    
    } else if (mode === 'barriera') {
        if (!isDrawingBarrier) {
            startPoint = { x, y };
            isDrawingBarrier = true;
            // Disegna un punto di feedback per l'inizio della barriera
            drawElements(parseFloat(document.getElementById("scalaPx").value) || 1);
            ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
        } else {
            barriere.push({ p1: startPoint, p2: { x, y } });
            isDrawingBarrier = false;
            startPoint = null;
        }
    }
    simula(); // Ridisegna tutto dopo ogni interazione
});

// --- Funzione Principale di Simulazione ---

function simula() {
    const scala = parseFloat(document.getElementById("scalaPx").value) || 1;
    const attenuazioneBarriera = parseFloat(document.getElementById("attenuazioneBarriera").value) || 0;

    // 1. Pulisci e disegna la planimetria di base
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    
    const colori = [
        { min: 90, max: Infinity, color: "rgba(255,0,0,0.4)", label: "> 90 dB" },
        { min: 80, max: 90, color: "rgba(255,165,0,0.4)", label: "80–90 dB" },
        { min: 70, max: 80, color: "rgba(255,255,0,0.4)", label: "70–80 dB" },
        { min: 60, max: 70, color: "rgba(144,238,144,0.4)", label: "60–70 dB" },
        { min: 50, max: 60, color: "rgba(0,128,0,0.4)", label: "50–60 dB" },
        { min: 0,  max: 50,  color: "rgba(173,216,230,0.4)", label: "< 50 dB" }
    ];

    // FIX 2: La mappa di calore viene disegnata solo se ci sono sorgenti
    if (sorgenti.length > 0) {
        const step = 10; // Calcola un punto ogni 10 pixel per velocità
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

    // 2. Disegna tutti gli elementi (sorgenti, barriere, recettori)
    drawElements(scala);

    // 3. Aggiorna legenda
    updateLegenda(colori);
}

// --- Funzioni di Calcolo e Disegno ---

function calcolaLivelloPunto(x, y, scala, attBarriera) {
    let sommaEnergetica = 0;

    sorgenti.forEach(s => {
        const dx = (x - s.x) * scala;
        const dy = (y - s.y) * scala;
        const distanza = Math.max(1, Math.sqrt(dx * dx + dy * dy)); // Evita log(0)

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
        if (!isNaN(livello)) { // FIX 3: Aggiunge il contributo solo se è un numero valido
             sommaEnergetica += Math.pow(10, livello / 10);
        }
    });

    if (sommaEnergetica === 0) return 0;
    return 10 * Math.log10(sommaEnergetica);
}

function drawElements(scala) {
    // Disegna barriere
    ctx.strokeStyle = "red";
    ctx.lineWidth = 3;
    barriere.forEach(b => {
        ctx.beginPath();
        ctx.moveTo(b.p1.x, b.p1.y);
        ctx.lineTo(b.p2.x, b.p2.y);
        ctx.stroke();
    });

    // Disegna sorgenti
    sorgenti.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = "black";
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.nome, s.x, s.y);
    });
    
    // Disegna recettori e calcola il loro livello
    const attBarriera = parseFloat(document.getElementById("attenuazioneBarriera").value) || 0;
    recettori.forEach((r, i) => {
        const livello = calcolaLivelloPunto(r.x, r.y, scala, attBarriera);
        ctx.beginPath();
        ctx.arc(r.x, r.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "blue";
        ctx.fill();
        ctx.fillStyle = "black";
        ctx.font = "12px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(`R${i + 1}: ${livello.toFixed(1)} dB`, r.x + 10, r.y);
    });
}

function updateLegenda(colori) {
    const legendaDiv = document.getElementById("legenda");
    legendaDiv.innerHTML = "<b>Legenda (dB):</b><br>" + colori.map(c =>
        `<div><span style="display:inline-block;width:15px;height:10px;background:${c.color};margin-right:5px;border:1px solid #ccc;"></span>${c.label}</div>`
    ).join("");
}

// --- Funzioni Utilità ---

function reset() {
    sorgenti = [];
    recettori = [];
    barriere = [];
    isDrawingBarrier = false;
    startPoint = null;
    document.getElementById("nomeSorgente").value = "S1";
    // Pulisce anche la selezione del file per consistenza
    document.getElementById("uploadImg").value = "";
    img = null;
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
    // Mostra un feedback all'utente che il PDF è in fase di creazione
    const button = document.querySelector('button[onclick="generaPDF()"]');
    button.textContent = '📄 Creazione PDF in corso...';
    button.disabled = true;

    html2canvas(document.getElementById("mappaCanvas")).then(canvas => {
        const imgData = canvas.toDataURL("image/png");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

        const dataCreazione = new Date().toLocaleDateString('it-IT');
        let finalY = 0; // Tiene traccia della posizione verticale sulla pagina

        // --- Intestazione e Titolo ---
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text("Rapporto di Valutazione Previsionale Acustica", doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Data di emissione: ${dataCreazione}`, doc.internal.pageSize.getWidth() / 2, 28, { align: 'center' });
        
        finalY = 40; // Posizione di partenza sotto l'intestazione

        // --- Sezione 1: Riferimenti Normativi e Metodologici ---
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

        // --- Sezione 2: Metodologia di Calcolo ---
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

        // --- Sezione 3: Parametri di Input (Tabella Sorgenti) ---
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

        // Aggiunge una nuova pagina se non c'è abbastanza spazio
        if (finalY > 200) {
            doc.addPage();
            finalY = 20;
        }

        // --- Sezione 4: Risultati della Simulazione ---
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text("4. Risultati della Simulazione", 15, finalY);
        finalY += 8;
        
        // Immagine simulazione
        const imgProps = doc.getImageProperties(imgData);
        const pdfWidth = doc.internal.pageSize.getWidth();
        const imgHeight = (imgProps.height * (pdfWidth - 30)) / imgProps.width;
        doc.addImage(imgData, 'PNG', 15, finalY, pdfWidth - 30, imgHeight);
        finalY += imgHeight + 5;

        // Tabella Recettori
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

        // --- Footer ---
        const pageCount = doc.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(9);
            doc.text(`Pagina ${i} di ${pageCount}`, doc.internal.pageSize.getWidth() - 25, 287);
            doc.text("Report generato con Simulatore Acustico Web", 15, 287);
        }

        // Salva il PDF
        doc.save(`Rapporto_Acustico_${new Date().toISOString().slice(0,10)}.pdf`);

        // Ripristina il bottone
        button.textContent = '📄 Genera PDF';
        button.disabled = false;
    }).catch(err => {
        console.error("Errore durante la generazione del PDF:", err);
        // Ripristina il bottone in caso di errore
        button.textContent = '📄 Genera PDF';
        button.disabled = false;
    });
}

// Esegui la simulazione all'avvio per mostrare una tela pulita e la legenda
simula();
