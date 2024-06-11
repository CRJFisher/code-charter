package main

import (
	"reflect"
	"testing"

	"github.com/sourcegraph/scip/bindings/go/scip"
)

func TestBuildCallGraphAtDefinitionHandlesRecursion(t *testing.T) {
	defSymbol := "testSymbol"
	refOccurrence := DocOccurrence{
		occurrence: &scip.Occurrence{
			Symbol: defSymbol,
			Range:  []int32{0, 0},
		},
	}
	defEnclosedRefs := map[string][]*DocOccurrence{
		defSymbol: {&refOccurrence},
	}
	defOccurrence := DocOccurrence{}
	g := &GraphElements{
		definitionOccurrences: map[string]*DocOccurrence{
			defSymbol: &defOccurrence,
		},
		definitionEnclosedRefs: defEnclosedRefs,
	}
	visitedNodes := make(map[string]*CallGraphNode)
	refOccurrences := make(map[string][]*DocOccurrence)

	buildCallGraphAtDefinition(g, defSymbol, visitedNodes, map[string]struct{}{}, refOccurrences)

	expectedNodes := map[string]*CallGraphNode{
		defSymbol: {
			nodeOccurrence:     &defOccurrence,
			enclosedReferences: []*DocOccurrence{&refOccurrence},
		},
	}

	if !reflect.DeepEqual(visitedNodes, expectedNodes) {
		t.Errorf("Expected %v, got %v", expectedNodes, visitedNodes)
	}
}

func TestBuildCallGraphAtDefinitionHandlesMultiFunctionRecursiveCycles(t *testing.T) {
	defSymbol1 := "testSymbol1"
	defSymbol2 := "testSymbol2"
	refOccurrence1 := DocOccurrence{
		occurrence: &scip.Occurrence{
			Symbol: defSymbol1,
			Range:  []int32{0, 0},
		},
	}
	refOccurrence2 := DocOccurrence{
		occurrence: &scip.Occurrence{
			Symbol: defSymbol2,
			Range:  []int32{0, 0},
		},
	}
	defOccurrence1 := DocOccurrence{}
	defOccurrence2 := DocOccurrence{}
	g := &GraphElements{
		definitionOccurrences: map[string]*DocOccurrence{
			defSymbol1: &defOccurrence1,
			defSymbol2: &defOccurrence2,
		},
		definitionEnclosedRefs: map[string][]*DocOccurrence{
			defSymbol1: {&refOccurrence2},
			defSymbol2: {&refOccurrence1},
		},
	}
	visitedNodes := make(map[string]*CallGraphNode)
	refOccurrences := make(map[string][]*DocOccurrence)

	buildCallGraphAtDefinition(g, defSymbol1, visitedNodes, map[string]struct{}{}, refOccurrences)

	expectedNodes := map[string]*CallGraphNode{
		defSymbol1: {
			nodeOccurrence:     &defOccurrence1,
			enclosedReferences: []*DocOccurrence{&refOccurrence2},
		},
		defSymbol2: {
			nodeOccurrence:     &defOccurrence2,
			enclosedReferences: []*DocOccurrence{&refOccurrence1},
		},
	}

	if !reflect.DeepEqual(visitedNodes, expectedNodes) {
		t.Errorf("Expected %v, got %v", expectedNodes, visitedNodes)
	}
}
