# create-mock-test

You are creating a new mock exam JSON file for the Mock TET repository. Read this entire file before doing anything else — it is your complete reference for syllabus, schema, and workflow.

---

## Step-by-step workflow

The work is split into three phases to keep per-call output token usage low and to let a deterministic Python script handle JSON assembly + manifest update (zero LLM tokens).

### Phase A — set up

1. **Parse the user's request.** Decide whether it is a full Paper 2 (default sections: `cdp english telugu math science`) or a mini-test (a subset of those). If unspecified, default to the full set.
2. **Read `exams/manifest.json`** to see existing exams and avoid duplicate IDs.
3. **Generate a unique exam ID** using the pattern `<type>-<subjects>-<nn>` (e.g. `paper2-full-01`, `paper2-mini-cdp-math-01`, `paper2-mini-telugu-01`).
4. **Create `exams/_raw/<exam-id>/meta.txt`** — see "Meta file format" below. This is the only file the main session writes during Phase A; everything else is written by subagents or the build script.

### Phase B — dispatch per-section subagents (sequential)

For **each** section listed in `meta.txt`, dispatch one Sonnet subagent (use the Agent tool, subagent_type omitted = general-purpose, sequential — wait for each to finish before starting the next so the main context doesn't grow). Each subagent's prompt must include:

- Only that section's syllabus slice from this file (do **not** paste the full syllabus into every subagent).
- The exact question count required (always 30 unless the user asked for fewer in a mini-test).
- The raw question-format spec and a one-question example (see "Raw question format" below).
- The output file path: `exams/_raw/<exam-id>/<section>.txt`.
- Question-writing rules 1–7 from this file.
- For the **`telugu`** section only: an explicit instruction to write all question text, options, and explanations in Telugu script (UTF-8). The format markers (`Q`, `A)`–`D)`, `E`, ` *`) stay ASCII.
- Instruction to write the file and return only a short confirmation — **not** to echo the questions back into the chat.

### Phase C — build and confirm

5. Run `python3 scripts/build_exam.py <exam-id>` via Bash. On non-zero exit, surface the script's error message to the user and stop.
6. **Confirm** to the user: file path of the new JSON, total questions, duration, sections included.

---

## Mini-test logic

When the user asks for a subset (e.g. "just Maths and CDP", "Telugu only"):
- Include **only the requested sections** in `meta.txt`'s `sections:` line — omit the others entirely.
- `duration`, `totalMarks`, and `totalQuestions` are derived by the build script as `sum(questionCount per section)`, 1 min per mark — no manual math needed.
- Set `type: Mini-Test` in `meta.txt`. The script writes the subtitle from the joined section names.

---

## Full Paper 2 structure (Telugu-medium adaptation of CTET)

| Section | id | Questions | Marks | Duration contribution | Content language |
|---|---|---|---|---|---|
| Child Development & Pedagogy | `cdp` | 30 | 30 | 30 min | English |
| English | `english` | 30 | 30 | 30 min | English |
| Telugu | `telugu` | 30 | 30 | 30 min | **Telugu (UTF-8)** |
| Mathematics | `math` | 30 | 30 | 30 min | English |
| Science | `science` | 30 | 30 | 30 min | English |
| **Total** | | **150** | **150** | **150 min** | |

Math has ≈20 content + ≈10 pedagogy questions. Science has ≈20 content + ≈10 pedagogy. No negative marking. 1 mark per question.

---

## Section IDs (for the `sections:` line in `meta.txt`)

Valid IDs: `cdp`, `english`, `telugu`, `math`, `science`. The build script computes `startIndex` cumulatively in the order they appear on the `sections:` line, so order = exam order. For full Paper 2 use:

```
sections: cdp english telugu math science
```

For mini-tests, list only the desired IDs; everything else (duration, startIndex, totals) is derived.

---

## Complete CTET Paper 2 Syllabus

### A. Child Development & Pedagogy (CDP) — 30 Questions

**Child Development (15 questions)**
- Concept of development; relationship between growth and development; principles of development
- Influence of Heredity and Environment on development
- Stages of development: infancy, childhood, adolescence — physical, cognitive, emotional, social, moral
- Piaget's theory of cognitive development (4 stages; schema, assimilation, accommodation)
- Vygotsky's socio-cultural theory; Zone of Proximal Development (ZPD); scaffolding
- Kohlberg's theory of moral development (6 stages, 3 levels)
- Howard Gardner's Multiple Intelligences (8 intelligences)
- Erikson's psychosocial stages
- Language development; Chomsky's Language Acquisition Device (LAD)
- Concept of Intelligence; theories of intelligence (Spearman's g factor, Thurstone's primary abilities)
- Emotional intelligence; Social and emotional learning
- Gender as a social construct; gender roles; gender-biased education
- Individual differences among learners; understanding diversity in learning styles
- Adolescence: characteristics, problems, peer influence, identity formation

**Inclusive Education — Understanding Children with Special Needs (5 questions)**
- Concepts of diversity, disability, and inclusion
- Types of disabilities: intellectual (formerly mental retardation), learning disability (dyslexia, dyscalculia, dysgraphia, ADHD), hearing impairment, visual impairment, autism spectrum disorder, cerebral palsy
- Inclusive classroom strategies; Universal Design for Learning (UDL)
- Rights of children with disabilities; RTE Act 2009; Disabilities Act
- Role of teacher in an inclusive classroom

**Learning and Pedagogy (10 questions)**
- How children think and learn; how and why children fail to achieve success in school
- Theories of learning: Behaviourism (Pavlov, Skinner — classical and operant conditioning), Constructivism (Bruner, Piaget), Social Learning Theory (Bandura)
- Motivation: intrinsic vs extrinsic; Maslow's hierarchy of needs
- Factors affecting learning: attention, memory, perception, emotion
- Formative vs summative assessment; Continuous and Comprehensive Evaluation (CCE)
- Critical thinking; problem-solving; creative thinking
- Child-centred education; activity-based learning; collaborative learning
- Role of language and cognition in learning
- Teaching-learning strategies for diverse learners
- National curriculum framework (NCF 2005) and its key recommendations
- New Education Policy (NEP 2020): key aspects relevant to upper primary

---

### B. English (`english`) — 30 Questions

All questions, options, and explanations are in **English**.

**Reading Comprehension (15 questions)**
- One or two short unseen English passages (narrative / discursive / literary) followed by inference, vocabulary, tone, and comprehension questions

**Pedagogy of Language Development (15 questions)**
- Principles of language learning and acquisition (Krashen's Monitor Model, Input Hypothesis)
- Difference between language acquisition and language learning
- Role of LSRW (listening, speaking, reading, writing) in second-language development
- Methods of teaching language: Communicative Language Teaching (CLT), Direct Method, Grammar-Translation, Audio-Lingual
- Reading: decoding, fluency, comprehension strategies; reading for meaning
- Writing: process writing, drafting, revising; creative writing
- Grammar: functional grammar in context (not prescriptive rules)
- Role of home language/L1 (Telugu) in learning L2 (English)
- Challenges of teaching English in a Telugu-medium / multilingual classroom
- Evaluation: formative tools (portfolio, observation, peer assessment)
- Remedial teaching in English

---

### C. Telugu (`telugu`) — 30 Questions

**All questions, options, and explanations must be written in Telugu script (UTF-8).** The format markers (`Q`, `A)`, `B)`, `C)`, `D)`, `E`, ` *`, blank lines) remain ASCII.

**Reading Comprehension (15 questions)**
- One or two short Telugu passages (narrative / poetic / informational) followed by comprehension, inference, vocabulary-in-context, and tone questions. Passages should be authentic Telugu prose suitable for upper-primary readers.

**Pedagogy of Language Development (15 questions)**
- Principles of mother-tongue language acquisition; importance of L1 in early education
- LSRW in Telugu development; oral fluency before literacy
- Methods of teaching Telugu reading and writing: phonics, whole-language, balanced approach
- Telugu script literacy: vowels, consonants, conjuncts; common reading errors
- Role of literature, folklore, and oral tradition in Telugu pedagogy
- Reading comprehension strategies for Telugu texts
- Grammar in context (sandhi, samaasa, vibhakti basics) — taught functionally
- Multilingual classroom: relating Telugu to English / Hindi / Sanskrit
- Evaluation of Telugu language skills: formative tools, portfolio, observation
- Remedial teaching for struggling readers in Telugu

---

### D. Mathematics — 30 Questions (content ≈20, pedagogy ≈10)

#### Content Topics

**Number System**
- Knowing our Numbers: Integers — positive and negative; absolute value; number line
- Playing with Numbers: Divisibility rules (2, 3, 4, 5, 6, 8, 9, 10, 11); LCM and HCF (Euclid's algorithm for HCF)
- Whole Numbers, Natural Numbers and their properties
- Fractions: types (proper, improper, mixed), operations, comparison
- Rational Numbers: definition, representation on number line, operations, standard form
- Decimals: terminating and non-terminating decimals; conversion between fractions and decimals
- Exponents and Powers: laws of exponents; scientific notation
- **Class 9–10 extension:** Real Numbers (Euclid's division lemma and algorithm; irrational numbers √2, √3 proof; decimal expansion of rationals)

**Algebra**
- Introduction to Algebra: variables, constants, algebraic expressions
- Ratio and Proportion; Unitary Method; Direct and Inverse proportion
- Algebraic Expressions: like/unlike terms; addition, subtraction, multiplication, division
- Identities: (a+b)², (a-b)², (a+b)(a-b), (a+b+c)², (a+b)³, (a-b)³, a³+b³, a³-b³
- Factorisation: common factor, grouping, difference of squares, trinomials
- Linear Equations in One Variable: solution, applications in word problems
- Linear Equations in Two Variables: graphical and algebraic solution; system of equations
- **Class 9–10 extension:** Polynomials (degree, coefficients, remainder theorem, factor theorem, zeros); Quadratic Equations (discriminant, nature of roots, quadratic formula, sum/product of roots); Arithmetic Progressions (nth term, sum formula)

**Geometry**
- Basic geometrical ideas: points, lines, angles (types), intersecting and parallel lines, transversal
- Triangles: properties (angle sum, exterior angle, triangle inequality); congruence (SSS, SAS, ASA, RHS, AAS); similarity (AA, SAS, SSS)
- Quadrilaterals: types (square, rectangle, rhombus, parallelogram, trapezium, kite); properties; angle sum
- Circles: radius, diameter, chord, arc, sector, segment; central and inscribed angles; tangent and its properties
- Polygons: regular/irregular; interior/exterior angle sum formulae
- Symmetry: line symmetry and rotational symmetry; order of symmetry
- Visualising 3D shapes: nets; Euler's formula (V + F = E + 2)
- Construction: bisectors, triangles, quadrilaterals using ruler and compass
- **Class 9–10 extension:** Coordinate Geometry (distance formula, section formula, mid-point, slope, collinearity); Trigonometry (sin, cos, tan definitions, identities, complementary angles, heights and distances)

**Mensuration**
- Perimeter and area of: square, rectangle, parallelogram, triangle, trapezium, rhombus, circle
- Area of combined shapes; area of paths
- Surface area and volume of: cube, cuboid, cylinder, cone, sphere, hemisphere, frustum
- Conversion of units; real-life applications
- **Class 9–10 extension:** Heron's formula; surface area and volume of complex 3D figures; conversion of solids

**Data Handling**
- Collection, organisation and representation of data: tally marks, frequency distribution tables
- Bar graphs, double bar graphs, histograms, pie/circle charts, line graphs
- Measures of central tendency: mean (direct method, assumed mean, step deviation), median, mode
- Chance and Probability: experimental vs theoretical; equally likely outcomes; complementary events
- **Class 9–10 extension:** Cumulative frequency (ogive); quartiles; probability of events (addition rule, mutually exclusive); random experiments

#### Pedagogical Issues in Mathematics (≈10 questions)

- Nature of Mathematics: abstract, logical, hierarchical structure; role of conjecture and proof
- Place of Mathematics in the curriculum: its relationship with other subjects
- Language of Mathematics: symbols, terminology, precise communication
- Community Mathematics: mathematics in everyday life; ethnomathematics
- Common student misconceptions and errors in arithmetic, algebra, geometry
- Strategies: constructivist approach; inductive-deductive methods; problem-solving approach; project method
- Use of manipulatives and technology (Geogebra, abacus, Dienes blocks, number strips)
- Evaluation: oral, written, performance-based, diagnostic testing
- Diagnostic and remedial teaching: identifying root causes of errors
- Differentiated instruction for diverse learners in Mathematics

---

### E. Science — 30 Questions (content ≈20, pedagogy ≈10)

#### Content Topics

**Food**
- Sources of food: plant and animal sources; producers, consumers
- Components of food: carbohydrates, proteins, fats, vitamins (A, B-complex, C, D), minerals, water, roughage; deficiency diseases (scurvy, rickets, night blindness, beri-beri, goitre, anaemia)
- Cleaning food: methods of separating mixtures (hand-picking, threshing, winnowing, sieving, sedimentation, decantation, filtration, evaporation, distillation, chromatography)

**Materials**
- Fibre to Fabric: types of fibres (natural: cotton, wool, silk, jute; synthetic: nylon, polyester, acrylic); spinning, weaving, knitting
- Metals and Non-metals: physical and chemical properties; reactivity series; uses
- Acids, Bases and Salts: indicators (litmus, turmeric, phenolphthalein); pH scale; strong/weak acids and bases; salts — preparation, properties; neutralisation; everyday applications
- Materials in Daily Use: glass, ceramics, cement; plastics (thermoplastics vs thermosetting); synthetic vs natural polymers
- **Class 9–10 extension:** Atoms and Molecules (law of conservation of mass, definite proportions, Dalton's atomic theory, molar mass, Avogadro's number); Structure of Atom (Thomson, Rutherford, Bohr models; atomic number; mass number; isotopes; electron configuration); Carbon and its Compounds (covalent bonding; homologous series; functional groups; IUPAC naming; ethanol and ethanoic acid; soaps and detergents); Periodic Classification (Dobereiner, Newlands, Mendeleev, Modern periodic table; trends)

**The World of the Living**
- Cell: structure of plant and animal cell; organelles and their functions (nucleus, mitochondria, chloroplast, ER, Golgi, ribosome, vacuole, lysosome); prokaryotic vs eukaryotic
- Organization: cell → tissue → organ → organ system → organism; types of tissues (epithelial, connective, muscular, nervous in animals; meristematic, permanent in plants)
- Microorganisms: bacteria, viruses, fungi, protozoa, algae; useful and harmful microorganisms; disease and immunity; food preservation
- Human Body: digestive system; respiratory system (cellular vs pulmonary respiration); circulatory system (heart, blood, blood groups, blood pressure); excretory system (kidney structure, urine formation); skeletal and muscular systems
- Reproduction: asexual (binary fission, budding, spore formation, vegetative propagation, fragmentation); sexual reproduction in flowering plants (pollination, fertilisation, seed dispersal); human reproduction; adolescence and puberty (hormonal changes, secondary sexual characters)
- Reaching the Age of Adolescence: physical changes; hormones; reproductive health; menstruation; AIDS; POCSO awareness
- Ecosystems: food chains and food webs; trophic levels; energy flow; producers, consumers, decomposers; biotic and abiotic factors; types of ecosystems
- Diversity in Living Organisms: five-kingdom classification; vertebrates and invertebrates; adaptations of animals and plants to habitat
- **Class 9–10 extension:** Life Processes (autotrophic vs heterotrophic nutrition; photosynthesis — light/dark reactions; respiration — aerobic/anaerobic, ATP; transportation — xylem, phloem, heart valves; excretion — nephron, dialysis); Control and Coordination (neurons, reflex arc, CNS/PNS, brain regions; endocrine system — glands and hormones, feedback); Heredity and Evolution (Mendel's laws, monohybrid/dihybrid cross, dominance; DNA as genetic material; natural selection; evolution evidence; speciation; human evolution); Our Environment (biodegradable vs non-biodegradable; ozone layer; waste management)

**Moving Things, People and Ideas — Force, Motion and Energy**
- Motion: types of motion (linear, circular, oscillatory); measurement of time and distance; speed, velocity, acceleration; distance-time and velocity-time graphs
- Force: contact and non-contact forces; effects of force; friction (types, factors, useful and harmful friction, reducing friction)
- Simple Machines: lever (3 classes), pulley, wheel and axle, inclined plane, screw, wedge; mechanical advantage
- Work, Energy, Power: definition; relationship; kinetic and potential energy; conservation of mechanical energy; renewable and non-renewable energy
- Sound: production; propagation; longitudinal waves; frequency, amplitude, wavelength, speed; reflection (echo); noise vs music; hearing range; noise pollution
- Light: rectilinear propagation; reflection (laws, plane and curved mirrors — image formation, sign convention); refraction (Snell's law, optical density, refractive index, total internal reflection); prism and dispersion; rainbow; lenses (convex/concave — image formation, lens formula); human eye (defects: myopia, hypermetropia, presbyopia, astigmatism — corrective lenses); power of lens
- **Class 9–10 extension:** Laws of Motion (Newton's 3 laws, inertia, momentum, impulse, friction); Gravitation (universal law, g, free fall, mass vs weight, buoyancy, Archimedes' principle, floatation); Electricity (Ohm's law, resistance, resistivity; series and parallel circuits; power, energy, heating effect; domestic electric circuits, safety); Magnetic Effects of Current (Oersted's experiment; electromagnet; Fleming's left hand rule; electric motor; Faraday's electromagnetic induction; electric generator; AC vs DC)

**Natural Phenomena**
- Rain: water cycle; condensation and evaporation; types of rainfall
- Thunder and Lightning: electrostatic charges; lightning conductors; safety measures
- Earthquakes: seismic waves; Richter scale; seismic zones; safety measures
- **Class 9–10 extension:** Light (detailed as above); Reflection and Refraction (covered under light)

**Natural Resources**
- Air: composition; oxygen cycle; nitrogen cycle; air pollution — sources, effects, control
- Water: importance; water cycle; water pollution — sources, effects, control; water conservation; rainwater harvesting
- Soil: formation; layers (horizons); soil types; soil erosion; conservation; microorganisms in soil
- Coal and Petroleum: formation; fractions of petroleum (LPG, petrol, kerosene, diesel, lubricants, paraffin, bitumen); fossil fuels as non-renewable; combustion
- Forests: importance; deforestation — causes and consequences; conservation
- Conservation of Natural Resources: 3Rs (Reduce, Reuse, Recycle); Wildlife protection; biosphere reserves; national parks; sanctuaries
- **Class 9–10 extension:** Our Environment (ecosystems in detail, ozone depletion, greenhouse effect, global warming); Management of Natural Resources (Chipko movement, water management — dams controversy, sustainability)

#### Pedagogical Issues in Science (≈10 questions)

- Nature and Structure of Sciences: scientific method; hypothesis; observation; experimentation; objectivity; falsifiability
- Aims and objectives of science education: scientific temper; curiosity; problem-solving; environmental awareness
- Approaches to science teaching: inductive, deductive, inquiry-based, project-based, integrated
- Observation and experimentation: importance in learning science; lab skills; designing experiments
- Concept mapping; analogical reasoning; use of models and simulations
- Common misconceptions in science (e.g. weight vs mass, conduction in metals, photosynthesis at night, evolution as progress)
- Text material and learning aids: textbooks, lab manuals, charts, models, ICT tools
- Evaluation in science: laboratory work assessment; observation skills; MCQs vs open-ended questions; rubrics
- Formative assessment strategies: think-pair-share, exit tickets, concept cartoons
- Remedial teaching: identifying conceptual gaps; reteaching strategies
- Science and Society: environmental education; STEM integration; gender equity in science

---

## JSON schema — owned by the build script

You do not author the final JSON — `scripts/build_exam.py` does. It owns the schema, computes `globalIndex` / `startIndex` / `duration` / `totalMarks` / `totalQuestions`, fills in canned `instructions` and `conductingBody`, and writes `exams/<exam-id>.json`. There are **no `*Hindi` fields**. Each text field carries content in one language: English for `cdp` / `english` / `math` / `science`; Telugu for `telugu`.

To inspect or change the schema, edit `scripts/build_exam.py`.

---

## Raw question format

Each section is written by its subagent to `exams/_raw/<exam-id>/<section>.txt`. Each question is **exactly 6 non-blank lines**, separated by a blank line:

```
Q1 According to Piaget, which stage involves abstract reasoning?
A) Sensorimotor
B) Pre-operational
C) Concrete operational
D) Formal operational *
E The Formal Operational Stage (12+ years) marks the onset of abstract and hypothetical reasoning.

Q2 Vygotsky's ZPD refers to:
A) The IQ range of a class
B) The gap between what a learner can do alone vs with guidance *
C) A fixed developmental milestone
D) A reading-level diagnostic
E Zone of Proximal Development is the difference between independent performance and assisted performance.
```

Parser rules (enforced by `scripts/build_exam.py`):
- `Q<n> <text>` opens a new question; `<n>` is 1-indexed per-section and must match position in the file.
- `A) <text>` / `B) <text>` / `C) <text>` / `D) <text>` are option lines (in order). A trailing ` *` (space + asterisk) marks the correct answer — exactly one per question.
- `E <text>` is the explanation — exactly one per question.
- Blank lines separate questions. Lines starting with `#` are comments (ignored).
- For the `telugu` section, the **content** after each marker is Telugu script; the markers themselves stay ASCII.

---

## Meta file format

`exams/_raw/<exam-id>/meta.txt` — written by the main session in Phase A. Plain `key: value` lines:

```
id: paper2-full-02
title: CTET Paper 2 — Telugu Medium — Test 2
type: Paper 2
targetClasses: Classes VI–VIII (+ IX–X extension)
sections: cdp english telugu math science
```

Required keys: `id`, `title`, `type`, `targetClasses`, `sections`. Everything else is derived.

---

## Question writing rules

1. **Factual accuracy first** — every content question must be verifiably correct per NCERT textbooks (classes 6–10).
2. **One clearly correct answer** — distractors should be plausible but unambiguously wrong.
3. **Pedagogy questions** test teaching knowledge, not content. Reference specific pedagogical approaches, learning theories, or assessment strategies.
4. **Difficulty spread**: aim for ≈40% easy, ≈40% medium, ≈20% hard within each section.
5. **No trick questions** — the real TET exam tests genuine knowledge, not word traps.
6. **Language by section** — `cdp` / `english` / `math` / `science` content in English; `telugu` content in Telugu script (UTF-8). No bilingual side-by-side text in the raw files.
7. **Unique questions**: before writing, check existing raw `.txt` files under `exams/_raw/` and assembled JSONs under `exams/` to avoid duplicates.
8. **Explanations**: every question needs a brief, educational explanation (1–2 sentences) that helps a candidate understand why the answer is correct.

---

## Manifest entry

The build script writes the manifest entry — do not edit `exams/manifest.json` by hand. See `scripts/build_exam.py`.

---

## Example invocations

| User says | `sections:` line in `meta.txt` | Result |
|---|---|---|
| "Create a new mock test" | `cdp english telugu math science` | Full Paper 2: 150 Qs, 150 min |
| "Create a mini test for Maths only" | `math` | 30 Qs, 30 min |
| "Mini test for CDP and Science" | `cdp science` | 60 Qs, 60 min |
| "Telugu-only mini test" | `telugu` | 30 Qs, 30 min, all in Telugu script |
| "Quick test for English pedagogy" | `english` | 30 Qs (skew towards pedagogy block), 30 min |
| "New test, focus on class 10 science topics" | `cdp english telugu math science` | Full Paper 2; Science subagent prompt skews towards class 9–10 extension topics |
