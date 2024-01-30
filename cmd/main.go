package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"

	"github.com/sourcegraph/scip/bindings/go/scip"
	"google.golang.org/protobuf/proto"
)

type DocOccurrenceRange struct {
	docOcc *DocOccurrence
	Range  *scip.Range
}

type ScopeStack struct {
	items []DocOccurrenceRange
}

func (s *ScopeStack) Push(item DocOccurrenceRange) {
	s.items = append(s.items, item)
}

func (s *ScopeStack) Pop() DocOccurrenceRange {
	if len(s.items) == 0 {
		panic("Stack is empty")
	}
	item := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return item
}

func (s *ScopeStack) Peek() DocOccurrenceRange {
	if len(s.items) == 0 {
		panic("Stack is empty")
	}
	return s.items[len(s.items)-1]
}

func (s *ScopeStack) IsEmpty() bool {
	return len(s.items) == 0
}

type GraphElements struct {
	symbols                map[string]*scip.SymbolInformation
	definitionOccurrences  map[string]*DocOccurrence
	refOccurrences         map[string][]*DocOccurrence
	definitionEnclosedRefs map[string][]*DocOccurrence
}

type DocOccurrence struct {
	document   *scip.Document
	occurrence *scip.Occurrence
}

func (r *DocOccurrence) EnclosesOccurrence(occ *DocOccurrence) bool {
	if r.document != occ.document {
		return false
	}
	defEnclosingRange := r.occurrence.GetEnclosingRange()
	if defEnclosingRange == nil {
		return false
	}
	defRange := scip.NewRange(defEnclosingRange)
	occRange := scip.NewRange(occ.occurrence.Range)
	return rangeContains(defRange, occRange)
}

func rangeContains(outer *scip.Range, inner *scip.Range) bool {
	if outer.Start.Line > inner.Start.Line || outer.End.Line < inner.End.Line {
		return false
	}
	if outer.Start.Line == inner.Start.Line && outer.Start.Character > inner.Start.Character {
		return false
	}
	if outer.End.Line == inner.End.Line && outer.End.Character < inner.End.Character {
		return false
	}
	return true
}

func rangeIsBefore(subject *scip.Range, other *scip.Range) bool {
	if subject.Start.Line < other.Start.Line {
		return true
	}
	if subject.Start.Line == other.Start.Line && subject.Start.Character < other.Start.Character {
		return true
	}
	return false
}

type CallGraphNode struct {
	nodeOccurrence     *DocOccurrence
	enclosedReferences []*DocOccurrence
}

func callDepth(nodeSymbol string, nodes map[string]*CallGraphNode) int {
	node := nodes[nodeSymbol]
	if len(node.enclosedReferences) == 0 {
		return 0
	}
	maxDepth := 0
	for _, ref := range node.enclosedReferences {
		depth := callDepth(ref.occurrence.Symbol, nodes)
		if depth > maxDepth {
			maxDepth = depth
		}
	}
	return maxDepth + 1
}

func main() {
	// read file
	b, err := os.ReadFile("../scip_indexes/gpt_researcher_index.scip")
	if err != nil {
		panic(err)
	}

	var index scip.Index // Use the actual SCIP Index type
	err = proto.Unmarshal(b, &index)
	if err != nil {
		log.Fatalf("Failed to unmarshal SCIP index: %v", err)
	}

	// todo: keep the reference
	graph := extractCallGraphElementsFromIndex(&index)

	topLevelNodes, allNodes := detectCallGraphs(&graph)

	sort.Slice(topLevelNodes, func(i, j int) bool {
		depthI := callDepth(topLevelNodes[i], allNodes)
		depthJ := callDepth(topLevelNodes[j], allNodes)
		return depthJ < depthI
	})

	for _, nodeName := range topLevelNodes {
		fmt.Println(" --------- ")
		printCallGraph(nodeName, allNodes, 0)
		fmt.Println("Depth: ", callDepth(nodeName, allNodes))
	}

	// Convert to JSON
	jsonData := make([]interface{}, 0)
	for _, node := range topLevelNodes {
		child := nodeToJson(node, nil, allNodes)
		jsonData = append(jsonData, child)
	}
	// Write to JSON
	jsonFile, err := os.Create("../out/call_graph.json")
	if err != nil {
		panic(err)
	}
	defer jsonFile.Close()
	jsonBytes, err := json.MarshalIndent(jsonData, "", "  ")
	if err != nil {
		panic(err)
	}
	jsonFile.Write(jsonBytes)
}

func extractCallGraphElementsFromIndex(index *scip.Index) GraphElements {
	symbols := make(map[string]*scip.SymbolInformation)
	definitionOccurrences := make(map[string]*DocOccurrence)
	refOccurrences := make(map[string][]*DocOccurrence)
	enclosedRefs := make(map[string][]*DocOccurrence)

	for _, doc := range index.Documents {
		docName := doc.RelativePath
		fmt.Printf("Document: %s\n", docName)
		docDefinitionOccurrences := make(map[string]*DocOccurrence)
		docRefOccurrences := make(map[string][]*DocOccurrence)
		for _, sym := range doc.Symbols {
			symbols[sym.Symbol] = sym
		}
		for _, occ := range doc.Occurrences {
			if scip.IsLocalSymbol(occ.Symbol) || occ.Symbol == "" {
				continue
			}
			// is it a definition or a reference?
			docOcc := &DocOccurrence{document: doc, occurrence: occ}
			if isDef := scip.SymbolRole_Definition.Matches(occ) && occ.EnclosingRange != nil; isDef { // without EnclosingRange check, it includes variable / parameter definitions
				docDefinitionOccurrences[occ.Symbol] = docOcc
				definitionOccurrences[occ.Symbol] = docOcc
			} else {
				// check if its symbol is a function, method or class
				docRefOccurrences[occ.Symbol] = append(docRefOccurrences[occ.Symbol], docOcc)
				refOccurrences[occ.Symbol] = append(refOccurrences[occ.Symbol], docOcc)

				// This isn't working because the symbol information is not being indexed. TODO: raise an issue on the sourcegraph/scip-python repo.
				// if sym, ok := symbols[occ.Symbol]; ok {
				// 	if sym.Kind == scip.SymbolInformation_Function || sym.Kind == scip.SymbolInformation_Method || sym.Kind == scip.SymbolInformation_Class {
				// 	}
				// }
			}
		}

		fmt.Printf("Doc (%s) definition occurrences: %d\n", doc.RelativePath, len(docDefinitionOccurrences))
		docEnclosedRefs := findEnclosedReferences(doc, docDefinitionOccurrences, docRefOccurrences)
		for symbol, refs := range docEnclosedRefs {
			if enclosedRefs[symbol] != nil {
				panic("Duplicate symbol")
			}
			enclosedRefs[symbol] = refs
		}
	}

	// TODO: differentiate external symbols by looking for ""scip-python python ." prefix which indicates an internal symbol.
	//  - include external definitions

	// filter enclosedRefs to include only references to other symbols with enclosing scopes (e.g. function or class definitions)
	enclosedRefsToOtherEnclosedRefs := make(map[string][]*DocOccurrence)
	for symbol, refs := range enclosedRefs {
		enclosedRefsToOtherEnclosedRefs[symbol] = make([]*DocOccurrence, 0)
		for _, ref := range refs {
			if _, ok := enclosedRefs[ref.occurrence.Symbol]; ok {
				enclosedRefsToOtherEnclosedRefs[symbol] = append(enclosedRefsToOtherEnclosedRefs[symbol], ref)
			}
		}
	}

	// filter refOccurrences to include only references to symbols with enclosing scopes (e.g. function or class definitions)
	refsWithEnclosingDefs := make(map[string][]*DocOccurrence)
	for symbol, refs := range refOccurrences {
		for _, ref := range refs {
			if _, ok := enclosedRefsToOtherEnclosedRefs[ref.occurrence.Symbol]; ok {
				refsWithEnclosingDefs[symbol] = append(refsWithEnclosingDefs[symbol], ref)
			}
		}
	}

	// count and print the number of different symbol types
	symbolTypeCount := make(map[scip.SymbolInformation_Kind]int)
	for _, sym := range symbols {
		symbolTypeCount[sym.Kind]++
	}
	fmt.Println("Symbol types:")
	for k, v := range symbolTypeCount {
		fmt.Printf("%s: %d\n", k, v)
	}

	return GraphElements{symbols: symbols, definitionOccurrences: definitionOccurrences, refOccurrences: refsWithEnclosingDefs, definitionEnclosedRefs: enclosedRefsToOtherEnclosedRefs}
}

func findEnclosedReferences(doc *scip.Document, docDefinitionOccurrences map[string]*DocOccurrence, docRefOccurrences map[string][]*DocOccurrence) map[string][]*DocOccurrence {
	// list of SymbolRange
	orderedDefinitionRanges := make([]*DocOccurrenceRange, 0)
	for _, def := range docDefinitionOccurrences {
		if def.occurrence.GetEnclosingRange() == nil {
			continue
		}
		orderedDefinitionRanges = append(orderedDefinitionRanges, &DocOccurrenceRange{docOcc: def, Range: scip.NewRange(def.occurrence.GetEnclosingRange())})
	}
	// sort definitionRanges by start line
	sort.Slice(orderedDefinitionRanges, func(i, j int) bool {
		return rangeIsBefore(orderedDefinitionRanges[i].Range, orderedDefinitionRanges[j].Range)
	})

	// range-ordered refs
	orderedRefs := make([]*DocOccurrenceRange, 0)
	for _, refs := range docRefOccurrences {
		for _, ref := range refs {
			orderedRefs = append(orderedRefs, &DocOccurrenceRange{docOcc: ref, Range: scip.NewRange(ref.occurrence.Range)})
		}
	}
	sort.Slice(orderedRefs, func(i, j int) bool {
		return rangeIsBefore(orderedRefs[i].Range, orderedRefs[j].Range)
	})

	// find which refs are inside each definition range
	scopeStack := &ScopeStack{}
	nextRefIndex := 0
	nextDefIndex := 0
	maxDocOccurrenceLine := 0
	if len(orderedDefinitionRanges) > 0 {
		maxDocOccurrenceLine = int(orderedDefinitionRanges[len(orderedDefinitionRanges)-1].Range.End.Line + 1)
	}
	docEnclosedRefs := make(map[string][]*DocOccurrence)
	// iterate over the lines in the document
	for line := 0; line < maxDocOccurrenceLine; line++ {
		// find the next definition range
		for nextDefIndex < len(orderedDefinitionRanges) && int(orderedDefinitionRanges[nextDefIndex].Range.Start.Line) == line {
			scopeStack.Push(*orderedDefinitionRanges[nextDefIndex])
			nextDefIndex++
		}
		// find the next reference range
		for nextRefIndex < len(orderedRefs) && int(orderedRefs[nextRefIndex].Range.Start.Line) == line {
			refRange := orderedRefs[nextRefIndex]
			// find the enclosing definition range
			for !scopeStack.IsEmpty() {
				defRange := scopeStack.Peek()
				// if the reference is inside the definition range, then add it to the enclosed refs
				if rangeContains(defRange.Range, refRange.Range) {
					docEnclosedRefs[defRange.docOcc.occurrence.Symbol] = append(docEnclosedRefs[defRange.docOcc.occurrence.Symbol], orderedRefs[nextRefIndex].docOcc)
					break
				} else {
					scopeStack.Pop()
				}
			}
			nextRefIndex++
		}
	}

	return docEnclosedRefs
}

func detectCallGraphs(g *GraphElements) ([]string, map[string]*CallGraphNode) {
	nodes := make(map[string]*CallGraphNode)
	refs := make(map[string][]*DocOccurrence)
	for enclosingDefSymbol := range g.definitionEnclosedRefs {
		if _, ok := nodes[enclosingDefSymbol]; !ok {
			buildCallGraphAtDefinition(g, enclosingDefSymbol, nodes, refs)
		}
	}

	// Top level nodes are nodes that are not referenced by other nodes
	topLevelNodes := make([]string, 0)
	for symbol := range nodes {
		if len(refs[symbol]) == 0 {
			topLevelNodes = append(topLevelNodes, symbol)
		}
	}

	return topLevelNodes, nodes
	// Future work
	// TODO: use symbol relationships to find any edges for:
	//   - implementations
	//   - type definitions
}

func buildCallGraphAtDefinition(g *GraphElements, definitionSymbol string, visitedNodes map[string]*CallGraphNode, refOccurrences map[string][]*DocOccurrence) {
	nodeDef := g.definitionOccurrences[definitionSymbol]
	refsInsideNode := g.definitionEnclosedRefs[definitionSymbol]
	enclosedRefs := make([]*DocOccurrence, 0)
	if _, ok := g.definitionEnclosedRefs[definitionSymbol]; !ok {
		return
	}
	node := &CallGraphNode{nodeOccurrence: nodeDef}
	for _, enclosedRef := range refsInsideNode {
		// This doesn't work because the symbol information is not being indexed. TODO: raise an issue on the sourcegraph/scip-python repo.
		// if g.symbols[enclosedRef.occurrence.Symbol].Kind == scip.SymbolInformation_Class {
		// 	// TODO: if the definition is a class, then find the constructor definition. For now, just handle functions.
		// 	enclosedRefs = append(enclosedRefs, &CallGraphNode{refOccurrence: enclosedRef})
		// } else
		refSymbol := enclosedRef.occurrence.Symbol
		if _, ok := visitedNodes[refSymbol]; !ok { // handle recursive calls and previously visited references
			buildCallGraphAtDefinition(g, refSymbol, visitedNodes, refOccurrences)
		}
		enclosedRefs = append(enclosedRefs, enclosedRef)
		refOccurrences[refSymbol] = append(refOccurrences[refSymbol], enclosedRef)
	}
	node.enclosedReferences = enclosedRefs
	visitedNodes[definitionSymbol] = node
}

func printCallGraph(nodeName string, allNodes map[string]*CallGraphNode, depth int) {
	node := allNodes[nodeName]
	fmt.Printf("%s%s\n", indent(depth), removeFirstFourSections(node.nodeOccurrence.occurrence.Symbol))
	for _, ref := range node.enclosedReferences {
		// handle recursion - todo: this doesn't handle recursion loops with > 1 function loop step e.g. A->B->A
		refDef := allNodes[ref.occurrence.Symbol]
		if refDef.nodeOccurrence == node.nodeOccurrence {
			fmt.Printf("%s%s\n", indent(depth+1), removeFirstFourSections(refDef.nodeOccurrence.occurrence.Symbol))
			continue
		}
		printCallGraph(ref.occurrence.Symbol, allNodes, depth+1)
	}
}

func indent(depth int) string {
	out := ""
	for i := 0; i < depth; i++ {
		out += "\t"
	}
	return out
}

func removeFirstFourSections(s string) string {
	return strings.Join(strings.Split(s, " ")[4:], " ")
}

func nodeToJson(nodeSymbol string, reference *DocOccurrence, allNodes map[string]*CallGraphNode) map[string]interface{} {
	node := allNodes[nodeSymbol]
	nodeJson := make(map[string]interface{})
	nodeJson["symbol"] = node.nodeOccurrence.occurrence.Symbol
	if reference != nil {
		ref := make(map[string]interface{})
		refRange := scip.NewRange(reference.occurrence.Range)
		refRangeJson := make(map[string]interface{})
		refRangeJson["start_line"] = refRange.Start.Line
		refRangeJson["start_character"] = refRange.Start.Character
		refRangeJson["end_line"] = refRange.End.Line
		refRangeJson["end_character"] = refRange.End.Character
		ref["range"] = refRangeJson
		ref["document"] = reference.document.RelativePath
		nodeJson["reference_node"] = ref
	}
	def := make(map[string]interface{})
	defRange := scip.NewRange(node.nodeOccurrence.occurrence.Range)
	def["range"] = make(map[string]interface{}, 0)
	def["range"].(map[string]interface{})["start_line"] = defRange.Start.Line
	def["range"].(map[string]interface{})["start_character"] = defRange.Start.Character
	def["range"].(map[string]interface{})["end_line"] = defRange.End.Line
	def["range"].(map[string]interface{})["end_character"] = defRange.End.Character
	def["document"] = node.nodeOccurrence.document.RelativePath
	if node.nodeOccurrence.occurrence.EnclosingRange != nil {
		def["enclosing_range"] = make(map[string]interface{}, 0)
		enclosingRange := scip.NewRange(node.nodeOccurrence.occurrence.EnclosingRange)
		def["enclosing_range"].(map[string]interface{})["start_line"] = enclosingRange.Start.Line
		def["enclosing_range"].(map[string]interface{})["start_character"] = enclosingRange.Start.Character
		def["enclosing_range"].(map[string]interface{})["end_line"] = enclosingRange.End.Line
		def["enclosing_range"].(map[string]interface{})["end_character"] = enclosingRange.End.Character
	}
	nodeJson["definition_node"] = def
	nodeJson["children"] = make([]interface{}, 0)
	for _, ref := range node.enclosedReferences {
		nodeJson["children"] = append(nodeJson["children"].([]interface{}), nodeToJson(ref.occurrence.Symbol, ref, allNodes))
	}
	return nodeJson
}
