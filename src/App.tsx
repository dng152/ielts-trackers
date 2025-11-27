import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { Target, TrendingUp, BookOpen, Headphones, Save, History, PlusCircle, Trash2, Edit3, CheckSquare, ExternalLink, Library, StickyNote, Flag, Sprout, LogIn, LogOut, Loader2, Calendar, Wand2 } from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

// ==========================================
// ⚠️ CẤU HÌNH FIREBASE (Dùng chung với Vocab Garden)
// ==========================================
const firebaseConfig = {
      apiKey: "AIzaSyArHo3gqBJruAo-mbxqTGzQpHd9L8wtyJk",
      authDomain: "vocab-garden-34782.firebaseapp.com",
      projectId: "vocab-garden-34782",
      storageBucket: "vocab-garden-34782.firebasestorage.app",
      messagingSenderId: "188945133804",
      appId: "1:188945133804:web:907b733d5a324761d1b5c9",
      measurementId: "G-680H5JDZ8Q"
    };

// --- KHỞI TẠO FIREBASE ---
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let app: any;
let auth: any;
let db: any;
const VOCAB_GARDEN_APP_ID = 'vocab-garden';

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.warn("Chưa cấu hình Firebase Config đúng.");
}

// --- HELPER FUNCTIONS ---

const getCEFRLevel = (word: any) => {
  if (!word) return 'A1';
  const len = word.length;
  const unique = new Set(word).size;
  const score = len + unique;
  if (score <= 6) return 'A1';
  if (score <= 9) return 'A2';
  if (score <= 12) return 'B1';
  if (score <= 15) return 'B2';
  if (score <= 19) return 'C1';
  return 'C2';
};

const calculateBand = (rawScore: any, type: any) => {
  if (rawScore === 0) return 0;
  const score = parseInt(rawScore);
  if (isNaN(score)) return 0;
  if (type === 'reading') {
    if (score >= 39) return 9.0; if (score >= 37) return 8.5; if (score >= 35) return 8.0;
    if (score >= 33) return 7.5; if (score >= 30) return 7.0; if (score >= 27) return 6.5;
    if (score >= 23) return 6.0; if (score >= 19) return 5.5; if (score >= 15) return 5.0;
    if (score >= 13) return 4.5; if (score >= 10) return 4.0; return 3.5;
  } else {
    if (score >= 39) return 9.0; if (score >= 37) return 8.5; if (score >= 35) return 8.0;
    if (score >= 32) return 7.5; if (score >= 30) return 7.0; if (score >= 26) return 6.5;
    if (score >= 23) return 6.0; if (score >= 18) return 5.5; if (score >= 16) return 5.0;
    if (score >= 13) return 4.5; if (score >= 10) return 4.0; return 3.5;
  }
};

const generateHeatmapDays = () => {
  const days = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
};

// --- DATA SERVICE (Cloud Only) ---

const DataService = {
  syncToGarden: async (user: any, vocabList: any, testName: any) => {
    if (!user || !db || vocabList.length === 0) return { success: false, count: 0 };
    
    let count = 0;
    const gardenRef = collection(db, `artifacts/${VOCAB_GARDEN_APP_ID}/users/${user.uid}/words`);

    for (const v of vocabList) {
      if (!v.checked) continue;

      let enrichedData = {
        phonetic: '',
        partOfSpeech: 'noun',
        audio: null,
        definition: '',
        translatedMeaning: ''
      };

      try {
        const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${v.text}`);
        if (dictRes.ok) {
            const data = await dictRes.json();
            const entry = data[0];
            
            enrichedData.phonetic = entry.phonetic || (entry.phonetics.find((p: any) => p.text)?.text) || '';
            enrichedData.partOfSpeech = entry.meanings[0]?.partOfSpeech || 'noun';
            enrichedData.audio = entry.phonetics.find((p: any) => p.audio)?.audio || null;
            enrichedData.definition = entry.meanings[0]?.definitions[0]?.definition || '';
        }

        if (!v.note) {
             const transRes = await fetch(`https://api.mymemory.translated.net/get?q=${v.text}&langpair=en|vi`);
             const transData = await transRes.json();
             if (transData && transData.responseData) {
                 enrichedData.translatedMeaning = transData.responseData.translatedText;
             }
        }
      } catch (err) {
        console.warn(`Lỗi tra cứu cho: ${v.text}`, err);
      }

      const finalMeaning = v.note ? v.note : (enrichedData.translatedMeaning || enrichedData.definition || 'Từ vựng từ IELTS Tracker');

      const gardenWord = {
        text: v.text,
        meaning: finalMeaning,
        example: `Context in ${testName}`,
        phonetic: enrichedData.phonetic,
        partOfSpeech: enrichedData.partOfSpeech,
        folder: 'IELTS Tracker',
        tags: `IELTS, ${testName}`,
        link: v.link || '',
        note: v.note || '', 
        cefr: getCEFRLevel(v.text),
        image: null,
        audio: enrichedData.audio,
        dateAdded: new Date().toISOString(),
        reviewCount: 0,
        aiPracticeCount: 0
      };

      try {
        await addDoc(gardenRef, gardenWord);
        count++;
      } catch (e) {
        console.error("Lỗi sync từ:", v.text, e);
      }
    }
    return { success: true, count };
  }
};

// --- COMPONENTS ---

function AuthButton({ user, onLogin, onLogout }: any) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: any) => {
    e.preventDefault(); setLoading(true);
    try {
      await onLogin(email, password);
      setShowForm(false);
    } catch (e: any) { alert("Đăng nhập thất bại: " + e.message); }
    setLoading(false);
  };

  if (user) {
    return (
      <button onClick={onLogout} className="flex items-center gap-2 bg-emerald-700/50 hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold transition">
        <LogOut size={14} /> {user.email.split('@')[0]}
      </button>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition">
        <LogIn size={14} /> Đăng nhập
      </button>
      {showForm && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white text-slate-800 p-4 rounded-xl shadow-xl border border-slate-200 z-50">
          <h4 className="font-bold mb-2 text-sm flex items-center gap-2"><Sprout size={16} className="text-emerald-600"/> Đăng nhập Garden</h4>
          <form onSubmit={handleLogin} className="space-y-2">
            <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full p-2 border rounded text-sm" required />
            <input type="password" placeholder="Mật khẩu" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-2 border rounded text-sm" required />
            <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white py-2 rounded font-bold text-xs hover:bg-emerald-700">
              {loading ? 'Đang kết nối...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function VocabInput({ value, onChange, onSelectSuggestion, placeholder, className }: any) {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef<any>(null);

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (value.length > 1) {
                try {
                    const res = await fetch(`https://api.datamuse.com/sug?s=${value}`);
                    const data = await res.json();
                    setSuggestions(data.slice(0, 5));
                    setShowSuggestions(true);
                } catch(e) {
                    setSuggestions([]);
                }
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        };
        const timeoutId = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timeoutId);
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: any) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const getLevelColor = (level: string) => {
        switch(level) {
            case 'A1': return 'bg-green-50 text-green-700 border-green-200';
            case 'A2': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'B1': return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'B2': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
            case 'C1': return 'bg-purple-50 text-purple-700 border-purple-200';
            case 'C2': return 'bg-pink-50 text-pink-700 border-pink-200';
            default: return 'bg-slate-50 text-slate-500 border-slate-200';
        }
    };

    return (
        <div className="relative flex-1" ref={wrapperRef}>
            <input type="text" placeholder={placeholder} value={value} onChange={onChange} className={className} />
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute bottom-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl mb-1 z-50 overflow-hidden">
                    {suggestions.map((s, i) => {
                        const level = getCEFRLevel(s.word);
                        const levelClass = getLevelColor(level);
                        return (
                            <div key={i} onClick={() => { onSelectSuggestion(s.word); setShowSuggestions(false); }} className="px-3 py-2 hover:bg-slate-100 cursor-pointer text-sm text-slate-700 flex justify-between items-center">
                                <span>{s.word}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${levelClass}`}>{level}</span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
}

export default function IELTSTrackerPro() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState<any[]>([]);
  const [targetBand, setTargetBand] = useState(6.5);
  const [user, setUser] = useState<any>(null);
  
  const [editingId, setEditingId] = useState<any>(null);
  const [inputType, setInputType] = useState('listening');
  const [scores, setScores] = useState<any>({ p1: '', p2: '', p3: '', p4: '' });
  const [testName, setTestName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().substr(0, 10));
  
  const [notes, setNotes] = useState('');
  const [vocabList, setVocabList] = useState<any[]>([]); 
  const [tempVocab, setTempVocab] = useState({ text: '', link: '', note: '' });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingMeaning, setIsLoadingMeaning] = useState(false);

  useEffect(() => {
    if (auth) {
      const unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) {
            const logsRef = collection(db, `artifacts/${VOCAB_GARDEN_APP_ID}/users/${u.uid}/ielts_logs`);
            const q = query(logsRef, orderBy('date', 'desc'));
            const unsubLogs = onSnapshot(q, (snapshot) => {
                const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setLogs(fetchedLogs);
            });

            const settingsRef = doc(db, `artifacts/${VOCAB_GARDEN_APP_ID}/users/${u.uid}/settings`);
            getDoc(settingsRef).then(snap => {
                if (snap.exists() && snap.data().targetBand) {
                    setTargetBand(snap.data().targetBand);
                }
            });

            return () => {
                unsubLogs();
            };
        } else {
            setLogs([]);
        }
      });
      return () => unsub();
    }
  }, []);

  const updateTargetBand = async (newTarget: number) => {
      setTargetBand(newTarget);
      if (user) {
          const settingsRef = doc(db, `artifacts/${VOCAB_GARDEN_APP_ID}/users/${user.uid}/settings`);
          await setDoc(settingsRef, { targetBand: newTarget }, { merge: true });
      }
  };

  const handleLogin = (email: any, password: any) => signInWithEmailAndPassword(auth, email, password);
  const handleLogout = () => signOut(auth);

  const handleScoreChange = (part: any, value: any) => {
    if (value === '' || (parseInt(value) >= 0 && parseInt(value) <= 40)) {
      setScores((prev: any) => ({ ...prev, [part]: value }));
    }
  };

  const handleSelectSuggestion = async (word: string) => {
      setTempVocab(prev => ({ ...prev, text: word }));
      setIsLoadingMeaning(true);
      try {
          const res = await fetch(`https://api.mymemory.translated.net/get?q=${word}&langpair=en|vi`);
          const data = await res.json();
          if (data && data.responseData && data.responseData.translatedText) {
              setTempVocab(prev => ({ ...prev, note: data.responseData.translatedText }));
          }
      } catch (e) {
          console.log("Không tìm thấy nghĩa tự động");
      } finally {
          setIsLoadingMeaning(false);
      }
  };

  const addVocab = () => {
    if (!tempVocab.text.trim()) return;
    const newItem = {
      id: Date.now(), 
      text: tempVocab.text,
      link: tempVocab.link,
      note: tempVocab.note,
      checked: true 
    };
    setVocabList([...vocabList, newItem]);
    setTempVocab({ text: '', link: '', note: '' });
  };

  const removeVocab = (id: any) => {
    setVocabList(vocabList.filter(v => v.id !== id));
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!user) return alert("Vui lòng đăng nhập để lưu kết quả lên Cloud!");

    const p1 = parseInt(scores.p1) || 0;
    const p2 = parseInt(scores.p2) || 0;
    const p3 = parseInt(scores.p3) || 0;
    const p4 = parseInt(scores.p4) || 0;
    
    const totalRaw = p1 + p2 + p3 + p4;
    const band = calculateBand(totalRaw, inputType);
    const finalTestName = testName || `Practice Test`;

    const logData = {
      date,
      testName: finalTestName,
      type: inputType,
      breakdown: inputType === 'listening' ? { p1, p2, p3, p4 } : { p1, p2, p3 },
      totalRaw,
      band,
      notes,
      vocabList 
    };

    try {
        if (editingId) {
            const docRef = doc(db, `artifacts/${VOCAB_GARDEN_APP_ID}/users/${user.uid}/ielts_logs`, editingId);
            await updateDoc(docRef, logData);
        } else {
            const logsRef = collection(db, `artifacts/${VOCAB_GARDEN_APP_ID}/users/${user.uid}/ielts_logs`);
            await addDoc(logsRef, logData);
        }

        if (vocabList.length > 0) {
            setIsSyncing(true);
            const result = await DataService.syncToGarden(user, vocabList, finalTestName);
            if (result.success && result.count > 0) {
                alert(`Đã lưu Cloud & Trồng ${result.count} từ mới sang Vocab Garden! 🌱`);
            } else {
                alert('Đã lưu kết quả (Không có từ vựng nào được sync).');
            }
            setIsSyncing(false);
        } else {
            alert(`Đã lưu kết quả lên Cloud! Band: ${band}`);
        }

        resetForm();
        setActiveTab('dashboard');

    } catch (err) {
        console.error(err);
        alert("Lỗi khi lưu dữ liệu lên Cloud.");
    }
  };

  const handleEdit = (log: any) => {
    setEditingId(log.id);
    setInputType(log.type);
    setTestName(log.testName);
    setDate(log.date);
    setScores({
      p1: log.breakdown.p1 || '',
      p2: log.breakdown.p2 || '',
      p3: log.breakdown.p3 || '',
      p4: log.breakdown.p4 || '',
    });
    setNotes(log.notes || '');
    setVocabList(log.vocabList || []);
    setActiveTab('input');
  };

  const handleDelete = async (id: any) => {
     if (confirm('Xóa kết quả này khỏi Cloud?')) {
        if (user) {
            const docRef = doc(db, `artifacts/${VOCAB_GARDEN_APP_ID}/users/${user.uid}/ielts_logs`, id);
            await deleteDoc(docRef);
        }
     }
  };

  const toggleVocabCheckInHistory = (logId: any, vocabId: any) => {
    const updatedLogs = logs.map(log => {
      if (log.id === logId) {
        return {
          ...log,
          vocabList: log.vocabList.map((v: any) => v.id === vocabId ? { ...v, checked: !v.checked } : v)
        };
      }
      return log;
    });
    setLogs(updatedLogs);
  };

  const toggleVocabCheckGlobal = (originalLogId: any, vocabId: any) => {
    toggleVocabCheckInHistory(originalLogId, vocabId);
  };

  const resetForm = () => {
    setEditingId(null);
    setScores({ p1: '', p2: '', p3: '', p4: '' });
    setTestName('');
    setNotes('');
    setVocabList([]);
    setTempVocab({ text: '', link: '', note: '' });
    setDate(new Date().toISOString().substr(0, 10));
  };

  const setToday = (e: any) => { e.preventDefault(); setDate(new Date().toISOString().substr(0, 10)); };
  const setYesterday = (e: any) => { e.preventDefault(); const d = new Date(); d.setDate(d.getDate() - 1); setDate(d.toISOString().substr(0, 10)); };

  // --- STATS ---
  const listeningLogs = logs.filter(l => l.type === 'listening');
  const readingLogs = logs.filter(l => l.type === 'reading');
  const avgListening = listeningLogs.length > 0 ? (listeningLogs.reduce((a, b) => a + b.band, 0) / listeningLogs.length).toFixed(1) : 0;
  const avgReading = readingLogs.length > 0 ? (readingLogs.reduce((a, b) => a + b.band, 0) / readingLogs.length).toFixed(1) : 0;

  const chartData = [...logs].reverse().map(l => ({
    date: l.date,
    name: l.testName,
    listening: l.type === 'listening' ? l.band : null,
    reading: l.type === 'reading' ? l.band : null,
  }));

  const heatmapDays = generateHeatmapDays();
  const logsByDate = logs.reduce((acc: any, log: any) => { 
    if (log.date) {
      acc[log.date] = (acc[log.date] || 0) + 1; 
    }
    return acc; 
  }, {});
  
  const getHeatmapColor = (count: any) => !count ? 'bg-slate-100' : count === 1 ? 'bg-emerald-200' : count === 2 ? 'bg-emerald-400' : 'bg-emerald-600';

  const allVocabularies = logs.flatMap(log => 
    (log.vocabList || []).map((v: any) => ({ ...v, sourceTest: log.testName, sourceDate: log.date, originalLogId: log.id }))
  ).sort((a, b) => new Date(b.sourceDate).getTime() - new Date(a.sourceDate).getTime()); 

  const handleManualSync = async () => {
    if(!user) return alert("Vui lòng kết nối tài khoản Vocab Garden trước.");
    const confirmSync = confirm("Bạn có muốn đồng bộ lại toàn bộ từ vựng trong lịch sử sang Vocab Garden không?");
    if(!confirmSync) return;
    
    setIsSyncing(true);
    let total = 0;
    for(const log of logs) {
        const res = await DataService.syncToGarden(user, log.vocabList, log.testName);
        total += res.count;
    }
    setIsSyncing(false);
    alert(`Đã đồng bộ xong! Tổng cộng ${total} từ đã được gửi sang vườn.`);
  }

  const inputParts: string[] = inputType === 'listening' ? ['p1', 'p2', 'p3', 'p4'] : ['p1', 'p2', 'p3'];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* HEADER */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-20 shadow-md">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2 rounded-lg">
              <TrendingUp size={24} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">IELTS Focus</h1>
              <p className="text-xs text-slate-400">Data-driven Progress Tracking</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
             <div className="hidden md:flex gap-6 text-sm">
                 <div className="text-center">
                    <div className="text-slate-400 text-xs uppercase font-semibold">Listening Avg</div>
                    <div className={`text-xl font-bold ${parseFloat(avgListening.toString()) >= targetBand ? 'text-emerald-400' : 'text-white'}`}>{avgListening || '-'}</div>
                 </div>
                 <div className="text-center">
                    <div className="text-slate-400 text-xs uppercase font-semibold">Reading Avg</div>
                    <div className={`text-xl font-bold ${parseFloat(avgReading.toString()) >= targetBand ? 'text-emerald-400' : 'text-white'}`}>{avgReading || '-'}</div>
                 </div>
                 <div className="text-center">
                    <div className="text-slate-400 text-xs uppercase font-semibold">Target</div>
                    <div className="text-xl font-bold text-emerald-400">{targetBand}</div>
                 </div>
             </div>
             <div className="h-8 w-px bg-slate-700 hidden md:block"></div>
             <AuthButton user={user} onLogin={handleLogin} onLogout={handleLogout} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 pb-32">
        
        {/* === FIXED BOTTOM NAVIGATION (FLOATING STYLE) === */}
        {/* Đã xóa hoàn toàn các class responsive (md:) để giữ nguyên vị trí dưới đáy trên mọi màn hình */}
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-md p-2 rounded-2xl shadow-2xl border border-slate-200 z-50 flex items-center gap-1 w-[95%] max-w-md">
          
          <button onClick={() => { resetForm(); setActiveTab('dashboard'); }} className={`flex-1 py-3 rounded-xl font-medium text-xs flex flex-col items-center justify-center gap-1 transition-all ${activeTab === 'dashboard' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
            <TrendingUp size={20} /> <span className="">Dashboard</span>
          </button>
          
          <button onClick={() => setActiveTab('input')} className={`flex-1 py-3 rounded-xl font-medium text-xs flex flex-col items-center justify-center gap-1 transition-all ${activeTab === 'input' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
            {editingId ? <Edit3 size={20} /> : <PlusCircle size={20} />} 
            <span className="">Nhập điểm</span>
          </button>
          
          <button onClick={() => setActiveTab('vocab')} className={`flex-1 py-3 rounded-xl font-medium text-xs flex flex-col items-center justify-center gap-1 transition-all ${activeTab === 'vocab' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Library size={20} /> <span className="">Từ vựng</span>
          </button>
          
          <button onClick={() => { resetForm(); setActiveTab('history'); }} className={`flex-1 py-3 rounded-xl font-medium text-xs flex flex-col items-center justify-center gap-1 transition-all ${activeTab === 'history' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
            <History size={20} /> <span className="">Lịch sử</span>
          </button>

        </div>

        {/* --- DASHBOARD --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><Flag size={20} /></div>
                    <div><h3 className="text-sm font-bold text-slate-800">Mục tiêu Band Score</h3></div>
                </div>
                <select value={targetBand} onChange={(e) => updateTargetBand(parseFloat(e.target.value))} className="p-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none bg-slate-50">{[4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0].map(s => <option key={s} value={s}>{s}</option>)}</select>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
               <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 flex items-center gap-2"><Calendar size={16} /> Mức độ chăm chỉ (90 ngày qua)</h3>
               <div className="flex flex-wrap gap-1">
                  {heatmapDays.map(day => (
                      <div 
                        key={day} 
                        title={`${day}: ${logsByDate[day] || 0} bài`}
                        className={`w-3 h-3 md:w-4 md:h-4 rounded-sm ${getHeatmapColor(logsByDate[day])} transition-all hover:ring-2 ring-slate-300 cursor-pointer`}
                      ></div>
                  ))}
               </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 flex items-center gap-2"><Target size={16} /> Biểu đồ phát triển</h3>
                <div className="h-64">
                    {logs.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" hide />
                            <YAxis domain={[0, 9]} tickCount={10} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Legend />
                            <ReferenceLine y={targetBand} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: `Target ${targetBand}`, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                            <Line connectNulls type="monotone" dataKey="listening" name="Listening" stroke="#6366f1" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                            <Line connectNulls type="monotone" dataKey="reading" name="Reading" stroke="#ec4899" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                        </LineChart>
                        </ResponsiveContainer>
                    ) : <div className="h-full flex items-center justify-center text-slate-400">Chưa đủ dữ liệu</div>}
                </div>
            </div>
            
            {/* Vocab Garden Integration Status */}
            <div className={`p-4 rounded-xl border flex items-start gap-3 transition-colors ${user ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'}`}>
                <div className={`mt-1 p-2 rounded-full ${user ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}><Sprout size={20} /></div>
                <div className="flex-1">
                    <h4 className={`font-bold ${user ? 'text-emerald-900' : 'text-slate-700'}`}>{user ? 'Đã kết nối Vocab Garden' : 'Chưa kết nối Vocab Garden'}</h4>
                    <p className={`text-sm mt-1 ${user ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {user 
                            ? `Từ vựng bạn nhập sẽ tự động được "trồng" vào khu vườn của ${user.email} với đầy đủ phiên âm, audio & loại từ!` 
                            : 'Đăng nhập ở góc phải để đồng bộ từ vựng sang app Vocab Garden.'}
                    </p>
                    {user && (
                        <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1 font-medium">
                            <Wand2 size={12} /> Auto-enrich enabled: Tự động tra cứu DictionaryAPI & Datamuse & MyMemory
                        </div>
                    )}
                </div>
            </div>
          </div>
        )}

        {/* --- INPUT FORM --- */}
        {activeTab === 'input' && (
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
               <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-center gap-4">
                  <button onClick={() => setInputType('listening')} className={`px-6 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${inputType === 'listening' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500 border'}`}><Headphones size={18} /> Listening</button>
                  <button onClick={() => setInputType('reading')} className={`px-6 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${inputType === 'reading' ? 'bg-pink-600 text-white shadow-lg' : 'bg-white text-slate-500 border'}`}><BookOpen size={18} /> Reading</button>
               </div>

               <form onSubmit={handleSubmit} className="p-6 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tên bài Test</label><input type="text" value={testName} onChange={e => setTestName(e.target.value)} required placeholder="VD: Cam 18 Test 2" className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-indigo-500" /></div>
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ngày thực hiện</label><div className="flex flex-col gap-2"><input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-indigo-500" /><div className="flex gap-2"><button type="button" onClick={setToday} className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded font-medium">Hôm nay</button><button type="button" onClick={setYesterday} className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded font-medium">Hôm qua</button></div></div></div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Số câu đúng</label>
                    <div className="grid grid-cols-4 gap-4">
                        {inputParts.map((part: string) => (
                            <div key={part}><input type="number" placeholder={`/${inputType === 'listening' && part === 'p4' ? '10' : '13-14'}`} min="0" max="14" value={scores[part as string]} onChange={e => handleScoreChange(part, e.target.value)} className="w-full p-3 text-center border border-slate-200 rounded-lg font-mono text-lg font-bold outline-none focus:border-indigo-500" /></div>
                        ))}
                    </div>
                  </div>

                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Ghi chú</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Bài học rút ra..." className="w-full p-3 border border-slate-200 rounded-lg h-24 text-sm outline-none resize-none focus:border-indigo-500"></textarea></div>

                  <div className={`p-4 rounded-lg border ${user ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Từ vựng mới (Checklist)</label>
                          {user && <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Wand2 size={10}/> Auto Sync & Enrich</span>}
                      </div>
                      <div className="flex flex-col gap-2 mb-3">
                          <div className="flex gap-2 relative">
                              {/* AUTOCOMPLETE INPUT */}
                              <VocabInput 
                                value={tempVocab.text}
                                onChange={(e: any) => setTempVocab({...tempVocab, text: e.target.value})}
                                onSelectSuggestion={handleSelectSuggestion}
                                placeholder="Từ vựng / Cụm từ (Có gợi ý)"
                                className="flex-1 p-2 border border-slate-200 rounded text-sm outline-none focus:border-indigo-500 w-full"
                              />
                              <input type="text" placeholder="Link" value={tempVocab.link} onChange={e => setTempVocab({...tempVocab, link: e.target.value})} className="flex-1 p-2 border border-slate-200 rounded text-sm outline-none focus:border-indigo-500" />
                          </div>
                          <div className="flex gap-2 relative">
                              <input type="text" placeholder="Nghĩa / Ghi chú (Nếu để trống sẽ tự lấy từ điển)" value={tempVocab.note} onChange={e => setTempVocab({...tempVocab, note: e.target.value})} className="flex-1 p-2 border border-slate-200 rounded text-sm outline-none focus:border-indigo-500" />
                              {isLoadingMeaning && <div className="absolute right-20 top-2"><Loader2 className="animate-spin text-slate-400" size={16}/></div>}
                              <button type="button" onClick={addVocab} className="bg-slate-800 text-white px-6 rounded text-sm font-medium hover:bg-slate-700">Thêm</button>
                          </div>
                      </div>
                      <div className="space-y-2 mt-4">
                          {vocabList.map(v => (
                              <div key={v.id} className="flex flex-col bg-white p-3 rounded border border-slate-200 text-sm gap-1">
                                  <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 overflow-hidden"><CheckSquare size={16} className="text-slate-300" /><span className="truncate font-bold text-slate-700">{v.text}</span></div>
                                      <button type="button" onClick={() => removeVocab(v.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                                  </div>
                                  {v.note && <div className="text-xs text-slate-500 pl-6 italic">{v.note}</div>}
                              </div>
                          ))}
                          {vocabList.length === 0 && <p className="text-center text-xs text-slate-400 py-2">Chưa thêm từ vựng nào</p>}
                      </div>
                  </div>

                  <button type="submit" disabled={isSyncing} className="w-full py-4 bg-slate-900 text-white font-bold rounded-lg shadow-lg hover:bg-slate-800 transition flex items-center justify-center gap-2">
                      {isSyncing ? <Loader2 className="animate-spin"/> : <Save size={20} />} 
                      {isSyncing ? 'Đang lưu & Trồng cây...' : (editingId ? 'Cập nhật kết quả' : 'Lưu kết quả')}
                  </button>
               </form>
           </div>
        )}

        {/* --- VOCAB LIBRARY --- */}
        {activeTab === 'vocab' && (
            <div className="space-y-4 animate-in fade-in duration-300">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Library size={20} className="text-indigo-600"/> Kho Từ Vựng Cá Nhân</h3>
                        <div className="flex gap-2">
                             {user && <button onClick={handleManualSync} className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold hover:bg-emerald-200 flex items-center gap-1"><Wand2 size={12}/> Sync All & Enrich</button>}
                             <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">Tổng: {allVocabularies.length} từ</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {allVocabularies.map((vocab, idx) => (
                            <div key={`${vocab.id}-${idx}`} className="p-4 rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all bg-white group">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2 mb-1">
                                        <button onClick={() => toggleVocabCheckGlobal(vocab.originalLogId, vocab.id)} className="mt-0.5">
                                            {vocab.checked ? <CheckSquare size={18} className="text-emerald-500" /> : <div className="w-4 h-4 border-2 border-slate-300 rounded hover:border-emerald-500"></div>}
                                        </button>
                                        <h4 className={`font-bold text-lg ${vocab.checked ? 'line-through text-slate-400' : 'text-slate-800'}`}>{vocab.text}</h4>
                                    </div>
                                    {vocab.link && <a href={vocab.link} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-600 bg-indigo-50 p-1.5 rounded-md"><ExternalLink size={16} /></a>}
                                </div>
                                {vocab.note && <div className="mt-2 mb-3 flex items-start gap-2 text-sm text-slate-600 bg-slate-50 p-2 rounded"><StickyNote size={14} className="mt-0.5 text-amber-500 flex-shrink-0" /><span>{vocab.note}</span></div>}
                                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400"><span>{vocab.sourceDate}</span><span className="truncate max-w-[150px]">{vocab.sourceTest}</span></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* --- HISTORY --- */}
        {activeTab === 'history' && (
            <div className="space-y-6 animate-in fade-in duration-300">
                {logs.length === 0 && <div className="text-center text-slate-400 py-12">Chưa có dữ liệu</div>}
                {logs.map(log => (
                    <div key={log.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden group">
                        <div className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-xl ${log.type === 'listening' ? 'bg-indigo-100 text-indigo-600' : 'bg-pink-100 text-pink-600'}`}>{log.type === 'listening' ? <Headphones size={24} /> : <BookOpen size={24} />}</div>
                                <div><h4 className="font-bold text-lg text-slate-800">{log.testName}</h4><p className="text-xs text-slate-500">{log.date} • {Object.values(log.breakdown).join(' - ')}</p></div>
                            </div>
                            <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                                <div className="text-right"><div className="text-xs font-bold text-slate-400 uppercase">Band</div><div className={`text-2xl font-bold ${log.band >= targetBand ? 'text-emerald-600' : 'text-slate-800'}`}>{log.band}</div></div>
                                <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleEdit(log)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit3 size={18} /></button><button onClick={() => handleDelete(log.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={18} /></button></div>
                            </div>
                        </div>
                        {(log.notes || (log.vocabList && log.vocabList.length > 0)) && (
                            <div className="p-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                                {log.notes && <div><h5 className="text-xs font-bold text-slate-400 uppercase mb-2">Ghi chú & Bài học</h5><p className="text-sm text-slate-700 bg-amber-50 p-3 rounded-lg border border-amber-100 whitespace-pre-wrap">{log.notes}</p></div>}
                                {log.vocabList && log.vocabList.length > 0 && (
                                    <div>
                                        <h5 className="text-xs font-bold text-slate-400 uppercase mb-2">Từ vựng cần nhớ ({log.vocabList.filter((v: any) => v.checked).length}/{log.vocabList.length})</h5>
                                        <div className="space-y-2">{log.vocabList.map((v: any) => (<div key={v.id} className={`flex flex-col gap-1 p-2 rounded transition-colors ${v.checked ? 'bg-slate-50' : 'bg-white border border-slate-100'}`}><div className="flex items-center justify-between"><div className="flex items-center gap-2 overflow-hidden"><button onClick={() => toggleVocabCheckInHistory(log.id, v.id)} className="mt-0.5">{v.checked ? <CheckSquare size={16} className="text-emerald-500" /> : <div className="w-4 h-4 border-2 border-slate-300 rounded hover:border-emerald-500"></div>}</button><span className={`text-sm font-medium ${v.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>{v.text}</span></div>{v.link && <a href={v.link} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700"><ExternalLink size={14} /></a>}</div>{v.note && <div className="text-xs text-slate-500 pl-7 italic">{v.note}</div>}</div>))}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
      </main>
    </div>
  );
}
