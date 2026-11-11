function deduplicateAssignments(assignments) {
    const statusPriority = { in_progress: 4, pending: 3, completed: 2, cancelled: 1 };
    const unique = new Map();

    for (const assignment of assignments) {
        const assignedDate = assignment.assigned_date instanceof Date
            ? assignment.assigned_date.toISOString().slice(0, 10)
            : String(assignment.assigned_date).slice(0, 10);
        const key = JSON.stringify([
            assignedDate,
            assignment.driver_id,
            assignment.route_id,
            assignment.truck_id,
            String(assignment.pickup_type || "regular").toLowerCase()
        ]);
        const existing = unique.get(key);
        const currentPriority = statusPriority[assignment.status] || 0;
        const existingPriority = existing ? statusPriority[existing.status] || 0 : -1;

        if (!existing || currentPriority > existingPriority ||
            (currentPriority === existingPriority && Number(assignment.id) > Number(existing.id))) {
            unique.set(key, assignment);
        }
    }

    return Array.from(unique.values());
}

module.exports = { deduplicateAssignments };
