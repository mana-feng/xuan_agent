@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package com.xuan.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class WebPalette(val id:String,val name:String,val primary:Color,val secondary:Color,val accent:Color,val background:Color,val ink:Color,val muted:Color,val border:Color,val tint:Color)
val WebPalettes=listOf(
 WebPalette("aurora","青蓝流光",Color(0xFF1672B1),Color(0xFF147F91),Color(0xFF11785F),Color(0xFFF3FAFB),Color(0xFF233E49),Color(0xFF647E89),Color(0xFFDCE8EC),Color(0xFFE7F4FC)),
 WebPalette("sunset","琥珀暖阳",Color(0xFFB35424),Color(0xFFA96918),Color(0xFF927117),Color(0xFFFCF9F2),Color(0xFF4A3C2D),Color(0xFF867866),Color(0xFFEADFD0),Color(0xFFFAEDDD)))
val LocalWebPalette=staticCompositionLocalOf { WebPalettes.first() }
@Composable fun WebCard(title:String="",content:@Composable ColumnScope.()->Unit) {
 val p=LocalWebPalette.current
 Surface(Modifier.fillMaxWidth(),shape=RoundedCornerShape(16.dp),color=Color.White,border=BorderStroke(1.dp,p.border)) {
  Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) { if(title.isNotEmpty()) WebSectionTitle(title);content() }
 }
}
@Composable fun WebSectionTitle(text:String) { Text(text,color=LocalWebPalette.current.ink,fontSize=18.sp,fontWeight=FontWeight.SemiBold,fontFamily=FontFamily.Serif) }
@Composable fun WebHeading(title:String,subtitle:String) {
 Column(Modifier.padding(top=8.dp,bottom=6.dp),verticalArrangement=Arrangement.spacedBy(9.dp)) {
  Text(title,fontSize=27.sp,color=LocalWebPalette.current.ink,fontFamily=FontFamily.Serif)
  Text(subtitle,color=LocalWebPalette.current.muted,fontSize=13.sp,lineHeight=21.sp)
 }
}
@Composable fun WebPill(text:String,selected:Boolean,onClick:()->Unit) {
 val p=LocalWebPalette.current
 Surface(modifier=Modifier.clickable(onClick=onClick),shape=RoundedCornerShape(8.dp),color=if(selected) p.tint else Color.White,border=BorderStroke(1.dp,if(selected) p.primary.copy(alpha=.35f) else p.border)) {
  Text(text,Modifier.padding(horizontal=12.dp,vertical=9.dp),fontSize=12.sp,color=if(selected) p.primary else p.muted)
 }
}
@Composable fun WebPrimaryButton(text:String,onClick:()->Unit,enabled:Boolean=true) {
 val p=LocalWebPalette.current
 Surface(Modifier.fillMaxWidth().clickable(enabled=enabled,onClick=onClick),shape=RoundedCornerShape(9.dp),color=Color.Transparent) {
  Box(Modifier.background(Brush.horizontalGradient(listOf(p.primary,p.accent)),alpha=if(enabled) 1f else .38f).padding(horizontal=16.dp,vertical=14.dp)) {
   Text(text,color=Color.White,fontSize=15.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.fillMaxWidth())
  }
 }
}
@Composable fun WebSegments(items:List<String>,selected:Int,onSelect:(Int)->Unit) {
 val p=LocalWebPalette.current
 Row(Modifier.fillMaxWidth().background(p.tint,RoundedCornerShape(8.dp)).padding(3.dp)) {
  items.forEachIndexed { i,text -> Surface(Modifier.weight(1f).clickable { onSelect(i) },shape=RoundedCornerShape(6.dp),color=if(i==selected) Color.White else Color.Transparent,shadowElevation=if(i==selected) 1.dp else 0.dp) {
   Text(text,Modifier.padding(horizontal=4.dp,vertical=10.dp),fontSize=12.sp,color=if(i==selected) p.primary else p.muted,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
  } }
 }
}
@Composable fun WebField(value:String,onChange:(String)->Unit,label:String,placeholder:String="",singleLine:Boolean=true) {
 val p=LocalWebPalette.current
 Column(verticalArrangement=Arrangement.spacedBy(7.dp)) { Text(label,color=p.ink,fontSize=13.sp)
  OutlinedTextField(value,onChange,modifier=Modifier.fillMaxWidth(),placeholder={Text(placeholder,fontSize=13.sp)},singleLine=singleLine,textStyle=LocalTextStyle.current.copy(fontSize=14.sp),shape=RoundedCornerShape(8.dp),colors=OutlinedTextFieldDefaults.colors(unfocusedBorderColor=p.border,focusedBorderColor=p.primary))
 }
}
