// Execute atopx/qimen unchanged. Run from its checkout so imports resolve locally.
package main

import (
    "encoding/json"
    "fmt"
    "os"
    "github.com/atopx/qimen"
    "github.com/atopx/qimen/almanac"
    "github.com/atopx/qimen/enum"
)

type Input struct { ID string `json:"id"`; Civil string `json:"civil"` }
func lodged(p uint8) string { if p==5 {return "2"};return fmt.Sprint(p) }
func main() {
    data,err:=os.ReadFile(os.Args[1]);if err!=nil {panic(err)}
    var inputs []Input;if err=json.Unmarshal(data,&inputs);err!=nil {panic(err)}
    rows:=make([]map[string]any,0,len(inputs))
    for _,input:=range inputs {
        var y,m,d,h,mi int
        _,err:=fmt.Sscanf(input.Civil,"%d-%d-%d %d:%d",&y,&m,&d,&h,&mi);if err!=nil {panic(err)}
        st,err:=almanac.SolarTimeOf(y,m,d,h,mi,0);if err!=nil {panic(err)}
        c:=qimen.From(st,qimen.WithMethod(enum.MethodTime),qimen.WithStyle(enum.StyleRotate),qimen.WithJuRule(enum.JuRuleChaiBu))
        ground:=map[string]string{}; sky:=map[string]string{}; stars:=map[string]string{};doors:=map[string]string{};gods:=map[string]string{}
        for p:=uint8(1);p<=9;p++ {
            cell:=c.Palace(p);key:=fmt.Sprint(p)
            ground[key]=cell.EarthStem.Name();sky[key]=cell.HeavenStem.Name()
            if p!=5 {stars[key]=cell.Star.Name();doors[key]=cell.Door.Name();gods[key]=cell.God.Name()}
        }
        yy:="yang";if c.YinYang()==almanac.Yin {yy="yin"}
        raw:=map[string]any{
            "siZhu":map[string]string{"year":c.Year().Name(),"month":c.Month().Name(),"day":c.Day().Name(),"time":c.Hour().Name()},
            "juShu":map[string]string{"type":yy,"number":fmt.Sprint(c.Ju()),"yuan":c.Yuan().Name(),"jieQiName":c.Term().Name()},
            "xunShou":c.XunShou().Name(),"diPan":ground,"tianPan":sky,"jiuXing":stars,"baMen":doors,"baShen":gods,
            "zhiFuGong":lodged(c.ZhiFu().Palace),"zhiFuXing":c.ZhiFu().Star.Name(),
            "zhiShiGong":lodged(c.ZhiShi().Palace),"zhiShiMen":c.ZhiShi().Door.Name(),
            "rawChiefPalaces":map[string]uint8{"zhiFu":c.ZhiFu().Palace,"zhiShi":c.ZhiShi().Palace,"origin":c.ZhiFu().OriginalPalace},
        }
        rows=append(rows,map[string]any{"id":input.ID,"raw":raw})
    }
    out:=map[string]any{"sourceCommit":"8eb06d007d4a5fcc5352d9054f81469e5f023f45","entrypoint":"qimen.From(st, MethodTime, StyleRotate, JuRuleChaiBu)","rows":rows}
    bytes,err:=json.MarshalIndent(out,"","  ");if err!=nil {panic(err)}
    if err=os.WriteFile(os.Args[2],append(bytes,'\n'),0644);err!=nil {panic(err)}
    fmt.Printf("Third implementation cases: %d\n",len(rows))
}
