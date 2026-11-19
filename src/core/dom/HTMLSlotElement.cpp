/*
 * Copyright (c) 2024-present Samsung Electronics Co., Ltd
 *
 *  This library is free software; you can redistribute it and/or
 *  modify it under the terms of the GNU Lesser General Public
 *  License as published by the Free Software Foundation; either
 *  version 2.1 of the License, or (at your option) any later version.
 *
 *  This library is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 *  Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public
 *  License along with this library; if not, write to the Free Software
 *  Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301
 *  USA
 */

#include "StarfishConfig.h"
#include "Starfish.h"
#include "core/dom/Document.h"
#include "binding/generated/ElementOrTextUnion.h"
#include "core/dom/DOMException.h"
#include "core/dom/HTMLSlotElement.h"
#include "core/dom/Text.h"
#include "core/dom/ShadowRoot.h"

namespace Starfish {

HTMLSlotElement::HTMLSlotElement(Document* document, const QualifiedName& qname)
    : HTMLElement(document, qname)
{
}

void* HTMLSlotElement::operator new(size_t size)
{
    STARFISH_ASSERT(size == sizeof(HTMLSlotElement));
    bool& typeInited = GCDescriptorCache<HTMLSlotElement>::inited;
    GC_descr& descr = GCDescriptorCache<HTMLSlotElement>::descr;
    if (!typeInited) {
        GC_word desc[GC_BITMAP_SIZE(HTMLSlotElement)] = { 0 };
        HTMLSlotElement::fillGCDescriptor(desc);
        descr = GC_make_descriptor(desc, GC_WORD_LEN(HTMLSlotElement));
        typeInited = true;
    }
    return GC_MALLOC_EXPLICITLY_TYPED(size, descr);
}

String* HTMLSlotElement::slotName()
{
    return getAttributeOrEmpty(starfish()->staticStrings()->m_name);
}

void HTMLSlotElement::clearAssignedNodes()
{
    for (auto n : m_assignedNodes) {
        n->setIsSlotted(false);
    }
    m_assignedNodes.clear();
}

// https://html.spec.whatwg.org/multipage/scripting.html#dom-slot-assign
// Manual slot assignment (slotAssignment="manual"): the given slottables
// become this slot's assigned nodes regardless of their slot= attribute or
// this slot's position among same-named slots. Google Maps' advanced-marker
// views rely on this to distribute their content element into the marker's
// shadow tree.
void HTMLSlotElement::assign(const GCVector<ElementOrText>& nodes)
{
    // 1. If any of nodes is the slot itself, throw a TypeError.
    for (auto& n : nodes) {
        Node* slottable = n.isElementValue()
                              ? static_cast<Node*>(n.getElementValue())
                              : static_cast<Node*>(n.getTextValue());
        if (slottable == this) {
            throw new DOMException(
                document()->executionContext(), DOMException::SCRIPT_TYPE_ERR,
                "Failed to execute 'assign' on 'HTMLSlotElement': Cannot "
                "assign a slot to itself.");
        }
    }

    // 2. Assign slottables. Snapshot the old assignment first so slotchange
    // fires only when the list actually changes (WHATWG DOM).
    GCVector<Node*> oldNodes = m_assignedNodes;

    clearAssignedNodes();
    for (auto* n : oldNodes) {
        // A formerly-assigned node keeps a stale cached style for its old
        // flat-tree position; drop it so recalc rebuilds it unslotted.
        n->clearCachedStyleRecursively();
    }

    for (auto& n : nodes) {
        Node* slottable = n.isElementValue()
                              ? static_cast<Node*>(n.getElementValue())
                              : static_cast<Node*>(n.getTextValue());
        m_assignedNodes.push_back(slottable);
        slottable->setIsSlotted(true);
    }

    bool changed = oldNodes.size() != m_assignedNodes.size();
    for (size_t i = 0; !changed && i < oldNodes.size(); i++) {
        if (oldNodes[i] != m_assignedNodes[i]) {
            changed = true;
        }
    }
    if (!changed) {
        return;
    }

    document()->signalSlotChange(this);

    // Fallback-content bookkeeping, mirroring ShadowRoot::
    // connectSlotWithSlottables(): the flat-tree children of a slot with
    // assigned nodes are those nodes (fallback not visited), and become the
    // slot's own children only when the assignment empties.
    if (m_assignedNodes.empty()) {
        for (Node* child = firstChild(); child; child = child->nextSibling()) {
            child->setNeedsStyleRecalc();
        }
    } else if (oldNodes.empty()) {
        for (Node* child = firstChild(); child; child = child->nextSibling()) {
            child->clearCachedStyleRecursively();
        }
    }

    // Assigned nodes keep their frames across (re)assignment, so a style
    // recalc alone would not move their boxes; rebuild the frame tree from
    // the slot so the new assignment is collected.
    setNeedsFrameTreeBuild();

    // Mark nodes that entered/left the assignment dirty: a newly assigned
    // node may now be reached by ::slotted() rules, and a node that lost its
    // assignment needs the "child needs recalc" bit propagated up through
    // the host for the top-down style-recalc walk to revisit this tree.
    auto contains = [](const GCVector<Node*>& list, Node* node) -> bool {
        for (auto* n : list) {
            if (n == node) {
                return true;
            }
        }
        return false;
    };
    for (auto* n : oldNodes) {
        if (!contains(m_assignedNodes, n)) {
            n->setNeedsStyleRecalc();
        }
    }
    for (auto* n : m_assignedNodes) {
        if (!contains(oldNodes, n)) {
            n->setNeedsStyleRecalc();
        }
    }
}

void HTMLSlotElement::didAttributeChanged(QualifiedName name,
                                          Optional<String*> old, String* value,
                                          bool attributeCreated,
                                          bool attributeRemoved)
{
    HTMLElement::didAttributeChanged(name, old, value, attributeCreated,
                                     attributeRemoved);
    if (name == starfish()->staticStrings()->m_name) {
        Node* nd = parentNode();
        while (nd) {
            if (nd->isShadowRoot()) {
                nd->asShadowRoot()->updateSlotElements();
                break;
            }
            nd = nd->parentNode();
        }
    }
}

void HTMLSlotElement::signalSlotChangeForFallbackMutation()
{
    // WHATWG DOM "insert"/"remove": when a node is inserted into or removed
    // from a slot whose assigned nodes is empty, signal a slot change for the
    // slot (it is rendering its fallback content). Ancestor slots showing
    // fallback are reached by slotchange bubbling, so only the directly mutated
    // slot is signaled here.
    if (!isInShadowRoot() || immutableAssignedNodes().size()) {
        return;
    }
    document()->signalSlotChange(this);
}

void HTMLSlotElement::didNodeInserted(Node* parent, Node* newChild)
{
    HTMLElement::didNodeInserted(parent, newChild);
    // The insertion dispatch walks this up the ancestor chain with parent fixed
    // to the insertion point; act only on a direct child insertion into this.
    if (parent == this) {
        signalSlotChangeForFallbackMutation();
    }
}

void HTMLSlotElement::didNodeRemoved(Node* parent, Node* oldChild)
{
    HTMLElement::didNodeRemoved(parent, oldChild);
    if (parent == this) {
        signalSlotChangeForFallbackMutation();
    }
}

void HTMLSlotElement::findFlattenedSlottables(GCVector<Node*>& result)
{
    // WHATWG DOM "find flattened slottables": a slot whose root is not a shadow
    // root contributes nothing (e.g. a slot detached from its tree).
    if (!isInShadowRoot()) {
        return;
    }

    // Slottables are the assigned nodes, or — when none are assigned — this
    // slot's own slottable children (its fallback content), in tree order.
    // A slottable is an Element or a Text node.
    auto append = [&](Node* nd) {
        // A slotted child that is itself a slot is expanded in place; any other
        // node (including a slot in a non-shadow root) is appended as-is.
        if (nd->isFlattenedAwaySlot()) {
            nd->asHTMLSlotElement()->findFlattenedSlottables(result);
        } else {
            result.push_back(nd);
        }
    };

    if (m_assignedNodes.size()) {
        for (Node* nd : m_assignedNodes) {
            append(nd);
        }
    } else {
        for (Node* child = firstChild(); child; child = child->nextSibling()) {
            if (child->isElement() || child->isText()) {
                append(child);
            }
        }
    }
}

GCVector<Node*> HTMLSlotElement::assignedNodes(
    Optional<AssignedNodesOptions> options)
{
    if (options && options.value().flatten()) {
        GCVector<Node*> result;
        findFlattenedSlottables(result);
        return result;
    }
    return m_assignedNodes;
}

GCVector<Element*> HTMLSlotElement::assignedElements(
    Optional<AssignedNodesOptions> options)
{
    GCVector<Node*> tempResult = assignedNodes(options);
    GCVector<Element*> result;
    for (Node* nd : tempResult) {
        if (nd->isElement()) {
            result.push_back(nd->asElement());
        }
    }
    return result;
}

} // namespace Starfish
