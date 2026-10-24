package com.xuan.core

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime

class BaziTransitTest {
    private val input = ChartInput("1990-06-15 10:30")
    private val engine = BaziTransit(input)
    @Test fun springYearIncludesNextJanuaryAndExcludesNextSpring() {
        val months=engine.months(2024)
        assertEquals(12,months.size)
        assertEquals("丙寅",months.first().ganzhi)
        assertEquals("丁丑",months.last().ganzhi)
        assertEquals(LocalDate.of(2025,1,5),months.last().start.toLocalDate())
        assertEquals(LocalDate.of(2025,2,3),months.last().end.toLocalDate())
        val days=engine.days(months.last())
        assertEquals(LocalDate.of(2025,1,5),days.first().date)
        assertEquals(LocalDate.of(2025,2,2),days.last().date)
        assertEquals(29,days.size)
    }
    @Test fun timeStartsAtPreviousNightZiAndDoesNotDependOnDst() {
        val times=engine.times(LocalDate.of(2024,3,10))
        assertEquals(12,times.size)
        assertEquals(LocalDateTime.of(2024,3,9,23,0),times.first().start)
        assertEquals("壬子",times.first().ganzhi)
        assertEquals("癸丑",times[1].ganzhi)
        assertEquals(21,times.last().start.hour)
    }
    @Test fun parentSelectionResetsDescendantsAndRebuildsActualDays() {
        var state=engine.locate(LocalDate.of(2024,12,30))
        assertEquals(2024,engine.years(state)[state.year].year)
        assertEquals("大雪",engine.months(state)[state.month].jie)
        assertEquals(LocalDate.of(2024,12,30),engine.days(state)[state.day].date)
        state=engine.select(state,BaziTransit.Level.MONTH,11)
        assertEquals(0,state.day); assertEquals(0,state.time)
        assertEquals(LocalDate.of(2025,1,5),engine.days(state).first().date)
        state=engine.select(state,BaziTransit.Level.YEAR,0)
        assertEquals(0,state.month); assertEquals(0,state.day); assertEquals(0,state.time)
        state=engine.select(state,BaziTransit.Level.CYCLE,1)
        assertEquals(0,state.year); assertEquals(0,state.month); assertEquals(0,state.day); assertEquals(0,state.time)
    }
    @Test fun initialLocationBeforeSpringUsesPreviousBaziYear() {
        val state=engine.locate(LocalDate.of(2025,1,20))
        assertEquals(2024,engine.years(state)[state.year].year)
        assertEquals(11,state.month)
        assertEquals(LocalDate.of(2025,1,20),engine.days(state)[state.day].date)
    }
    @Test fun childCycleDoesNotOverlapFirstLuckCycle() {
        val cycles=engine.cycles
        assertEquals(10,cycles.size)
        assertEquals("童限",cycles.first().ganzhi)
        assertEquals(1990,cycles.first().startYear)
        assertEquals(cycles[1].startYear-1,cycles.first().endYear)
        assertEquals(cycles[1].startYear,engine.years(BaziTransit.Selection(cycle=1)).first().year)
    }
    @Test fun allMonthlyDaysFormOneUnbrokenSpringYear() {
        val months=engine.months(2024)
        val days=months.flatMap(engine::days)
        assertEquals(365,days.size)
        assertEquals(LocalDate.of(2024,2,4),days.first().date)
        assertEquals(LocalDate.of(2025,2,2),days.last().date)
        days.zipWithNext().forEach { (a,b) ->
            assertEquals(a.date.plusDays(1),b.date)
            assertEquals(GanZhi.at(GanZhi.index(a.ganzhi)+1),b.ganzhi)
        }
    }
    @Test fun deviceZoneDoesNotChangeClockHoursAndSelectingTimeKeepsParents() {
        val other=BaziTransit(input.copy(timeZone="America/New_York"))
        assertEquals(engine.times(LocalDate.of(2024,3,10)),other.times(LocalDate.of(2024,3,10)))
        val state=engine.locate(LocalDate.of(2024,3,10))
        assertEquals(state.copy(time=11),engine.select(state,BaziTransit.Level.TIME,11))
        assertThrows(IllegalArgumentException::class.java) { engine.select(state,BaziTransit.Level.DAY,99) }
    }
    @Test fun noInventedTermDatesBeyondBundledCalendar() {
        assertTrue(engine.months(2102).isEmpty())
        assertEquals(12,engine.months(2101).size)
    }
    @Test fun tappingSelectedCycleClearsAllTransitColumnsAndLists() {
        val state=BaziTransit.Selection(cycle=3,year=2,month=5,day=8,time=2)
        val cleared=engine.select(state,BaziTransit.Level.CYCLE,3)
        assertEquals(BaziTransit.Selection(-1,-1,-1,-1,-1),cleared)
        assertTrue(engine.years(cleared).isEmpty())
        assertTrue(engine.months(cleared).isEmpty())
        assertTrue(engine.days(cleared).isEmpty())
        assertTrue(engine.times(cleared).isEmpty())
        val selected=engine.select(cleared,BaziTransit.Level.CYCLE,3)
        assertEquals(BaziTransit.Selection(cycle=3),selected)
        assertEquals(10,engine.years(selected).size)
        assertFalse(engine.days(selected).isEmpty())
    }
    @Test fun tappingSelectedYearKeepsCycleAndClearsYearAndDescendants() {
        val state=BaziTransit.Selection(cycle=3,year=2,month=5,day=8,time=2)
        val cleared=engine.select(state,BaziTransit.Level.YEAR,2)
        assertEquals(BaziTransit.Selection(3,-1,-1,-1,-1),cleared)
        assertEquals(10,engine.years(cleared).size)
        assertTrue(engine.months(cleared).isEmpty())
        assertTrue(engine.days(cleared).isEmpty())
        assertEquals(BaziTransit.Selection(3,2,0,0,0),engine.select(cleared,BaziTransit.Level.YEAR,2))
    }
    @Test fun tappingSelectedMonthKeepsParentsAndClearsMonthAndDay() {
        val state=BaziTransit.Selection(cycle=3,year=2,month=5,day=8,time=2)
        val cleared=engine.select(state,BaziTransit.Level.MONTH,5)
        assertEquals(BaziTransit.Selection(3,2,-1,-1,-1),cleared)
        assertEquals(12,engine.months(cleared).size)
        assertTrue(engine.days(cleared).isEmpty())
        assertEquals(BaziTransit.Selection(3,2,5,0,0),engine.select(cleared,BaziTransit.Level.MONTH,5))
    }
    @Test fun tappingSelectedDayKeepsParentsAndRemovesDayColumn() {
        val state=BaziTransit.Selection(cycle=3,year=2,month=5,day=8,time=2)
        val cleared=engine.select(state,BaziTransit.Level.DAY,8)
        assertEquals(BaziTransit.Selection(3,2,5,-1,-1),cleared)
        assertFalse(engine.days(cleared).isEmpty())
        assertTrue(engine.times(cleared).isEmpty())
        assertEquals(BaziTransit.Selection(3,2,5,8,0),engine.select(cleared,BaziTransit.Level.DAY,8))
    }
}
