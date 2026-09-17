// Editorial browsing subjects, not proof metadata or an inferred mathematical
// ontology. Specific content rules precede source-directory defaults. Unknown
// sources stay unclassified; tool names are matched explicitly, never by substring.
export const SUBJECTS = [
  {id:'number-theory',name:'Number theory',color:'#edc66d',domains:['Arith','ArithSums','ArithUnits','Digit','Factorization','PrimeForms','PrimeGaps','PrimeObserver','Scale','Depth','Tower','Weil','GoldenWindowZeroObstruction']},
  {id:'algebra',name:'Algebra',color:'#d99aca',domains:['Carrier','CayleyGrowth','Eigenstructure','Observation','Descent']},
  {id:'geometry',name:'Geometry & topology',color:'#6ad7c8',domains:['FiniteGeometry','Solenoid','SpectralTopology']},
  {id:'analysis',name:'Analysis & dynamics',color:'#ef9285',domains:['Analytic','AnalyticClosure','Asymptotics','Axis','CompletionDynamics','Constants','Dynamics','FixedPoints','Fourier','Midline','Phase','Zeros','ContinuousObservables']},
  {id:'combinatorics',name:'Combinatorics & discrete math',color:'#eba7cb',domains:['Recurrence','Words']},
  {id:'probability',name:'Probability, statistics & information',color:'#c4dc85',domains:['Deficit','Divergence','DivergenceSupport','Entropy','Estimation','RenyiDivergence','TotalVariation','ResourceOrder']},
  {id:'logic',name:'Logic & computation',color:'#a3b7fa',domains:['Automata','Computability','ConceptDynamics','Conventions','Diagonal','History','Ledger','Naming','Observer','ObserverMemory','Rewriting','CertificateHistory','Certificates']},
  {id:'physics',name:'Mathematical physics',color:'#7fbcea',domains:['FluidDynamics','Quantum','QuantumBounds','QuantumChannels','QuantumContext','QuantumStates','Resource','StatisticalMechanics','Quad']},
  {id:'infrastructure',name:'Formalization tools',color:'#83928e',auxiliary:true,domains:['PaperGenerator','RequiredChecks','SplitTool','ToolchainUpgrade','ValuesProducer','Trureturing','FutureInstances']},
  {id:'unclassified',name:'Unclassified',color:'#9c9c9c',auxiliary:true,domains:['D5P001','Hearts','HeartsDraft']},
];
const byId=new Map(SUBJECTS.map(s=>[s.id,s]));
const byDomain=new Map(SUBJECTS.flatMap(s=>s.domains.map(d=>[d,s])));
// Mixed source folders need content-level distinctions. These rules use titles
// and module paths available in every archive, so history needs no extra fetch.
const mixed=new Set(['Naming','Rewriting','ConceptDynamics','Observer','ObserverMemory','Certificates','Conventions','Diagonal','Tower','Constants','ResourceOrder']);
const rules=[
  ['number-theory',/\b(prime|primes|p adic|diophantine|divisibility|congruence|congruences|totient|pell|zeckendorf|goldbach|riemann|zeta|mertens)\b/i],
  ['physics',/\b(quantum|hilbert|hamiltonian|schrodinger|schrödinger|ising|pauli|clifford|chsh|thermodynamic)\b/i],
  ['probability',/\b(entropy|probability|probabilistic|bayesian|posterior|martingale|markov|variance|covariance|likelihood|random|stochastic|measure|full measure|kill rate)\b/i],
  ['geometry',/\b(topology|topological|homotopy|holonomy|curvature|manifold|metric space|completion.*dense|completion.*residual|dense.*completion|dense green class|dense naming boundary)\b/i],
  ['algebra',/\b(group|groups|monoid|homomorphism|isomorphism|functor|adjunction|subobject|quotient|quotients|surjection|eigenvalue|polynomial|matrix|matrices|linear algebra|galois)\b/i],
  ['analysis',/\b(derivative|integral|continuous|convergence|fourier|analytic|asymptotic|differential|lipschitz|real.*interval|rational.*interval|sublevel|box cover)\b/i],
  ['combinatorics',/\b(combinatorial|combinatorics|graph|graphs|coloring|colouring|ramsey|catalan|schroeder|schröder|permutation|permutations|enumeration|cardinality|counting)\b/i],
];
export function subjectFor(node) {
  const fallback=byDomain.get(node.domain);
  if(fallback?.auxiliary)return fallback;
  if(mixed.has(node.domain)) {
    const text=`${node.title||''} ${node.id||''}`.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_/\-]/g,' ');
    for(const [subject,pattern] of rules)if(pattern.test(text))return byId.get(subject);
  }
  return fallback||byId.get('unclassified');
}
